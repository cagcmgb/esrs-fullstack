import { Router } from 'express';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { UserRole } from '@prisma/client';
import { unauthorized } from '../utils/httpError.js';

export const dashboardRouter = Router();

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
        commodityId: true,
        production: true,
        commodity: { select: { name: true } }
      }
    });

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
      productionByCommodity: Object.values(productionByCommodity).sort((a, b) => b.value - a.value)
    });
  })
);
