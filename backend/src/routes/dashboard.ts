import { Router } from 'express';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { UserRole } from '@prisma/client';
import { unauthorized } from '../utils/httpError.js';

export const dashboardRouter = Router();

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Submissions in DRAFT status older than this many days are considered late. */
const LATE_FILING_THRESHOLD_DAYS = 30;
/** Separator used in the region::contractorId composite lookup key. */
const REGION_CONTRACTOR_KEY_SEP = '::';

dashboardRouter.get(
  '/summary',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthorized();
    const year = Number((req.query as any).year) || new Date().getFullYear();

    const contractorWhere: any = {};
    const submissionWhere: any = { year };

    if (req.user.role === UserRole.REGIONAL_ECONOMIST && req.user.regionCode) {
      contractorWhere.regionCode = req.user.regionCode;
      submissionWhere.contractor = { regionCode: req.user.regionCode };
    }

    const [totalContractors, verifiedContractors, pendingContractors] = await Promise.all([
      prisma.contractor.count({ where: contractorWhere }),
      prisma.contractor.count({ where: { ...contractorWhere, isVerified: true } }),
      prisma.contractor.count({ where: { ...contractorWhere, isVerified: false } })
    ]);

    const submissions = await prisma.submission.findMany({
      where: submissionWhere,
      select: {
        id: true,
        status: true,
        month: true,
        commodityId: true,
        production: true,
        sales: true,
        createdAt: true,
        submittedAt: true,
        contractor: {
          select: {
            id: true,
            name: true,
            regionCode: true,
            regionName: true
          }
        },
        commodity: { select: { name: true } }
      }
    });

    // ── Basic aggregates (existing) ──────────────────────────────────────────
    const submissionsByStatus: Record<string, number> = {};
    const productionByCommodity: Record<string, { commodityName: string; quantity: number; value: number }> = {};

    for (const s of submissions) {
      submissionsByStatus[s.status] = (submissionsByStatus[s.status] ?? 0) + 1;

      const prod: any = s.production ?? null;
      const qty = Number(prod?.totalQuantity ?? prod?.quantity ?? 0);
      const val = Number(prod?.totalValue ?? prod?.value ?? 0);

      const key = s.commodityId;
      if (!productionByCommodity[key]) {
        productionByCommodity[key] = { commodityName: s.commodity?.name ?? 'Unknown', quantity: 0, value: 0 };
      }
      productionByCommodity[key].quantity += qty;
      productionByCommodity[key].value += val;
    }

    // ── Regional stats ───────────────────────────────────────────────────────
    type RegionEntry = {
      regionCode: string;
      regionName: string;
      productionValue: number;
      fobValue: number;
      exciseTax: number;
      contractorMap: Map<string, string>;
      commodityQty: Record<string, number>;
      verifiedCount: number;
      pendingCount: number;
    };

    const regionalMap = new Map<string, RegionEntry>();
    // Track per-contractor production value within each region for top-3 ranking
    const contractorProductionValue = new Map<string, { id: string; name: string; value: number }>();

    for (const s of submissions) {
      const rc = s.contractor.regionCode;
      if (!regionalMap.has(rc)) {
        regionalMap.set(rc, {
          regionCode: rc,
          regionName: s.contractor.regionName,
          productionValue: 0,
          fobValue: 0,
          exciseTax: 0,
          contractorMap: new Map(),
          commodityQty: {},
          verifiedCount: 0,
          pendingCount: 0
        });
      }
      const entry = regionalMap.get(rc)!;

      const prod: any = s.production ?? {};
      const prodValue = Number(prod?.totalValue ?? prod?.value ?? 0);
      entry.productionValue += prodValue;
      const prodQty = Number(prod?.totalQuantity ?? prod?.quantity ?? 0);
      const commName = s.commodity?.name ?? 'Unknown';
      entry.commodityQty[commName] = (entry.commodityQty[commName] ?? 0) + prodQty;

      entry.contractorMap.set(s.contractor.id, s.contractor.name);

      // Accumulate per-contractor production value for top-3 ranking
      const cKey = `${rc}${REGION_CONTRACTOR_KEY_SEP}${s.contractor.id}`;
      const existing = contractorProductionValue.get(cKey);
      if (existing) {
        existing.value += prodValue;
      } else {
        contractorProductionValue.set(cKey, { id: s.contractor.id, name: s.contractor.name, value: prodValue });
      }

      const salesData: any = s.sales ?? {};
      const records: any[] = Array.isArray(salesData?.records) ? salesData.records : [];
      for (const r of records) {
        entry.fobValue += Number(r.valuePhp ?? 0);
        entry.exciseTax += Number(r.exciseTaxPayable ?? 0);
      }

      if (s.status === 'VERIFIED') entry.verifiedCount++;
      else if (s.status === 'SUBMITTED') entry.pendingCount++;
    }

    const regionalStats = Array.from(regionalMap.values()).map((e) => {
      const leadingCommodity = Object.entries(e.commodityQty).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'N/A';
      // Top 3 contractors ranked by production value within the region
      const topContractors = Array.from(contractorProductionValue.entries())
        .filter(([key]) => key.startsWith(`${e.regionCode}${REGION_CONTRACTOR_KEY_SEP}`))
        .map(([, v]) => v)
        .sort((a, b) => b.value - a.value)
        .slice(0, 3)
        .map(({ id, name }) => ({ id, name }));
      return {
        regionCode: e.regionCode,
        regionName: e.regionName,
        productionValue: e.productionValue,
        fobValue: e.fobValue,
        exciseTax: e.exciseTax,
        contractorCount: e.contractorMap.size,
        topContractors,
        leadingCommodity,
        verifiedCount: e.verifiedCount,
        pendingCount: e.pendingCount
      };
    });

    // ── Monthly trend (production qty vs sales qty) ──────────────────────────
    const monthlyMap: Record<number, { productionQty: number; salesQty: number }> = {};
    for (let m = 1; m <= 12; m++) {
      monthlyMap[m] = { productionQty: 0, salesQty: 0 };
    }

    for (const s of submissions) {
      const m = s.month;
      if (!m || m < 1 || m > 12) continue;

      const prod: any = s.production ?? {};
      monthlyMap[m].productionQty += Number(prod?.totalQuantity ?? prod?.quantity ?? 0);

      const salesData: any = s.sales ?? {};
      const records: any[] = Array.isArray(salesData?.records) ? salesData.records : [];
      for (const r of records) {
        monthlyMap[m].salesQty += Number(r.quantity ?? 0);
      }
    }

    const monthlyTrend = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      monthName: MONTH_NAMES[i],
      productionQty: monthlyMap[i + 1].productionQty,
      salesQty: monthlyMap[i + 1].salesQty
    }));

    // ── FOB value & excise tax totals ────────────────────────────────────────
    let totalFobValue = 0;
    let estimatedExciseTax = 0;
    for (const s of submissions) {
      const salesData: any = s.sales ?? {};
      const records: any[] = Array.isArray(salesData?.records) ? salesData.records : [];
      for (const r of records) {
        totalFobValue += Number(r.valuePhp ?? 0);
        estimatedExciseTax += Number(r.exciseTaxPayable ?? 0);
      }
    }

    // ── Late filing: DRAFT submissions created more than LATE_FILING_THRESHOLD_DAYS ago ──
    const lateFilingCutoff = new Date();
    lateFilingCutoff.setDate(lateFilingCutoff.getDate() - LATE_FILING_THRESHOLD_DAYS);

    const lateFilingWhere: any = {
      status: 'DRAFT',
      year,
      createdAt: { lt: lateFilingCutoff }
    };
    if (req.user.role === UserRole.REGIONAL_ECONOMIST && req.user.regionCode) {
      lateFilingWhere.contractor = { regionCode: req.user.regionCode };
    }

    const lateFilingContractors = await prisma.submission.findMany({
      where: lateFilingWhere,
      select: { contractorId: true },
      distinct: ['contractorId']
    });

    res.json({
      year,
      contractors: {
        total: totalContractors,
        verified: verifiedContractors,
        pending: pendingContractors
      },
      submissions: {
        total: submissions.length,
        byStatus: submissionsByStatus
      },
      productionByCommodity: Object.values(productionByCommodity).sort((a, b) => b.value - a.value),
      regionalStats,
      monthlyTrend,
      totalFobValue,
      estimatedExciseTax,
      lateFilingCount: lateFilingContractors.length
    });
  })
);
