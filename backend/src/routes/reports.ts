import { Router } from 'express';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { UserRole, ReportType, SubmissionStatus } from '@prisma/client';
import { forbidden, unauthorized } from '../utils/httpError.js';
import { createStandardSheet, sendWorkbook } from '../reports/workbook.js';

export const reportsRouter = Router();

reportsRouter.use(requireAuth);
reportsRouter.use(requireRole([UserRole.ADMIN, UserRole.CENTRAL_OFFICE, UserRole.REGIONAL_ECONOMIST]));

async function assertCanViewReport(user: { role: any; id: string }, reportType: ReportType) {
  if (user.role === UserRole.ADMIN) return;
  const perm = await prisma.reportPermission.findUnique({ where: { role_reportType: { role: user.role, reportType } } });
  if (!perm || !perm.canView) {
    throw forbidden('You do not have permission to view this report');
  }
}

reportsRouter.get(
  '/operating-mines',
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthorized();
    await assertCanViewReport(req.user, ReportType.OPERATING_MINES);

    const { regionCode, commodityId, mineralType } = req.query as any;

    const where: any = { isVerified: true };
    if (regionCode) where.regionCode = regionCode;

    if (req.user.role === UserRole.REGIONAL_ECONOMIST && req.user.regionCode) {
      where.regionCode = req.user.regionCode;
    }

    if (commodityId) {
      where.contractorCommodities = { some: { commodityId } };
    }

    if (mineralType) {
      where.contractorCommodities = { some: { commodity: { mineralType } } };
    }

    const contractors = await prisma.contractor.findMany({
      where,
      include: {
        status: true,
        contractorCommodities: { include: { commodity: true } }
      },
      orderBy: [{ regionName: 'asc' }, { contractorCode: 'asc' }]
    });

    const columns = ['Region', 'Contractor ID', 'Contractor/Company Name', 'Municipality', 'Province', 'Area (ha)', 'Commodity', 'Operator', 'Contact No.', 'Email', 'Status'];
    const { workbook, sheet, headerRowIndex } = createStandardSheet('OPERATING MINES', columns);

    let rowIndex = headerRowIndex + 1;

    for (const c of contractors) {
      const commodities = c.contractorCommodities.map((cc) => cc.commodity.name);
      const commodityText = commodities.join(', ');

      const row = sheet.getRow(rowIndex++);
      const values = [
        c.regionName,
        c.contractorCode ?? '',
        c.name,
        c.municipalityName,
        c.provinceName,
        c.areaHectare,
        commodityText,
        c.operatorName,
        c.contactNo,
        c.email,
        c.status.name
      ];

      values.forEach((v, i) => {
        row.getCell(i + 1).value = v as any;
        row.getCell(i + 1).border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        row.getCell(i + 1).alignment = { vertical: 'top', wrapText: true };
      });
    }

    await sendWorkbook(res, workbook, `Operating_Mines_${new Date().toISOString().slice(0, 10)}.xlsx`);
  })
);

reportsRouter.get(
  '/directory',
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthorized();
    await assertCanViewReport(req.user, ReportType.DIRECTORY);

    const asOfDate = (req.query as any).asOfDate ? new Date(String((req.query as any).asOfDate)) : new Date();
    const { regionCode, commodityId, mineralType } = req.query as any;

    const where: any = { isVerified: true };
    if (regionCode) where.regionCode = regionCode;

    if (req.user.role === UserRole.REGIONAL_ECONOMIST && req.user.regionCode) {
      where.regionCode = req.user.regionCode;
    }

    if (commodityId) {
      where.contractorCommodities = { some: { commodityId } };
    }

    if (mineralType) {
      where.contractorCommodities = { some: { commodity: { mineralType } } };
    }

    const contractors = await prisma.contractor.findMany({
      where,
      include: {
        permits: { include: { permitType: true } },
        contractorCommodities: { include: { commodity: true } }
      },
      orderBy: [{ regionName: 'asc' }, { name: 'asc' }]
    });

    const columns = ['Region', 'Commodity', 'Contractor ID', 'Contractor/Company Name', 'Municipality', 'Province', 'Contact No.', 'Email', 'TIN', 'Permit/s', 'Date Approved', 'Date of Expiration'];
    const { workbook, sheet, headerRowIndex } = createStandardSheet(`DIRECTORY (Active permits as of ${asOfDate.toDateString()})`, columns);

    let rowIndex = headerRowIndex + 1;

    for (const c of contractors) {
      const activePermits = c.permits.filter((p) => !p.dateExpiration || p.dateExpiration >= asOfDate);
      if (activePermits.length === 0) continue;

      const permitText = activePermits.map((p) => `${p.permitType.name}-${p.permitNumber}`).join('; ');
      const approvedDates = activePermits.map((p) => p.dateApproved).filter(Boolean) as Date[];
      const expiryDates = activePermits.map((p) => p.dateExpiration).filter(Boolean) as Date[];
      const minApproved = approvedDates.length ? new Date(Math.min(...approvedDates.map((d) => d.getTime()))) : null;
      const maxExpiry = expiryDates.length ? new Date(Math.max(...expiryDates.map((d) => d.getTime()))) : null;

      const commodityText = c.contractorCommodities.map((cc) => cc.commodity.name).join(', ');

      const row = sheet.getRow(rowIndex++);
      const values = [
        c.regionName,
        commodityText,
        c.contractorCode ?? '',
        c.name,
        c.municipalityName,
        c.provinceName,
        c.contactNo,
        c.email,
        c.tin,
        permitText,
        minApproved ? minApproved.toISOString().slice(0, 10) : '',
        maxExpiry ? maxExpiry.toISOString().slice(0, 10) : ''
      ];

      values.forEach((v, i) => {
        row.getCell(i + 1).value = v as any;
        row.getCell(i + 1).border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        row.getCell(i + 1).alignment = { vertical: 'top', wrapText: true };
      });
    }

    await sendWorkbook(res, workbook, `Directory_${new Date().toISOString().slice(0, 10)}.xlsx`);
  })
);

reportsRouter.get(
  '/production',
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthorized();
    await assertCanViewReport(req.user, ReportType.PRODUCTION);

    const { year, month, quarter, regionCode, commodityId, mineralType } = req.query as any;
    const y = Number(year) || new Date().getFullYear();

    const where: any = { year: y, status: SubmissionStatus.VERIFIED };
    if (month) where.month = Number(month);

    if (commodityId) where.commodityId = commodityId;

    if (req.user.role === UserRole.REGIONAL_ECONOMIST && req.user.regionCode) {
      where.contractor = { regionCode: req.user.regionCode };
    } else if (regionCode) {
      where.contractor = { regionCode };
    }

    if (mineralType) {
      where.commodity = { mineralType };
    }

    const submissions = await prisma.submission.findMany({
      where,
      include: { contractor: true, commodity: { include: { defaultUnit: true } } }
    });

    // Quarter filter (derived)
    const filtered = quarter
      ? submissions.filter((s) => s.month && Math.ceil(s.month / 3) === Number(quarter))
      : submissions;

    const columns = ['Year', 'Month', 'Quarter', 'Region', 'Contractor ID', 'Contractor/Company Name', 'Commodity', 'Production Qty', 'Unit', 'Production Value (PHP)', 'Inventory Qty', 'Inventory Value (PHP)'];
    const { workbook, sheet, headerRowIndex } = createStandardSheet('PRODUCTION REPORT', columns);

    let rowIndex = headerRowIndex + 1;

    for (const s of filtered) {
      const prod: any = s.production ?? {};
      const totalQty = Number(prod.totalQuantity ?? prod.quantity ?? 0);
      const unit = prod.unit ?? s.commodity.defaultUnit?.name ?? '';
      const totalVal = Number(prod.totalValue ?? prod.value ?? 0);
      const invQty = Number(prod.inventoryQuantity ?? 0);
      const invVal = Number(prod.inventoryValue ?? 0);

      const row = sheet.getRow(rowIndex++);
      const qtr = s.month ? Math.ceil(s.month / 3) : '';
      const values = [
        s.year,
        s.month ?? '',
        qtr,
        s.contractor.regionName,
        s.contractor.contractorCode ?? '',
        s.contractor.name,
        s.commodity.name,
        totalQty,
        unit,
        totalVal,
        invQty,
        invVal
      ];

      values.forEach((v, i) => {
        row.getCell(i + 1).value = v as any;
        row.getCell(i + 1).border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        row.getCell(i + 1).alignment = { vertical: 'top', wrapText: true };
      });
    }

    await sendWorkbook(res, workbook, `Production_${y}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  })
);

reportsRouter.get(
  '/sales',
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthorized();
    await assertCanViewReport(req.user, ReportType.SALES);

    const { year, month, quarter, regionCode, commodityId, mineralType } = req.query as any;
    const y = Number(year) || new Date().getFullYear();

    const where: any = { year: y, status: SubmissionStatus.VERIFIED };
    if (month) where.month = Number(month);
    if (commodityId) where.commodityId = commodityId;

    if (req.user.role === UserRole.REGIONAL_ECONOMIST && req.user.regionCode) {
      where.contractor = { regionCode: req.user.regionCode };
    } else if (regionCode) {
      where.contractor = { regionCode };
    }

    if (mineralType) {
      where.commodity = { mineralType };
    }

    const submissions = await prisma.submission.findMany({
      where,
      include: { contractor: true, commodity: { include: { defaultUnit: true } } }
    });

    const filtered = quarter
      ? submissions.filter((s) => s.month && Math.ceil(s.month / 3) === Number(quarter))
      : submissions;

    const columns = ['Year', 'Month', 'Quarter', 'Region', 'Contractor ID', 'Contractor/Company Name', 'Commodity', 'Destination Country', 'Qty', 'Unit', 'FOB Value (PHP)', 'FOB Value (USD)', 'Exchange Rate (USD/PHP)', 'Excise Tax Rate', 'Estimated Excise Tax Payable (PHP)', 'Export?'];
    const { workbook, sheet, headerRowIndex } = createStandardSheet('SALES REPORT', columns);

    let rowIndex = headerRowIndex + 1;

    for (const s of filtered) {
      const sales: any = s.sales ?? {};
      const records: any[] = Array.isArray(sales.records) ? sales.records : [];
      if (records.length === 0) {
        // still output a row (optional) — keep it simple: skip if no sales
        continue;
      }

      for (const r of records) {
        const row = sheet.getRow(rowIndex++);
        const qtr = s.month ? Math.ceil(s.month / 3) : '';
        const fobPhp = Number((r as any).fobValuePhp ?? (r as any).valuePhp ?? 0);
        const fobUsd = Number((r as any).fobValueUsd ?? (r as any).valueUsd ?? 0);
        const exchangeRate = Number((r as any).exchangeRate ?? 0);
        const exciseTaxRate = Number((r as any).exciseTaxRate ?? 0);
        const exciseTaxPayable = Number((r as any).exciseTaxPayable ?? (fobPhp > 0 && exciseTaxRate > 0 ? fobPhp * exciseTaxRate : 0));
        const values = [
          s.year,
          s.month ?? '',
          qtr,
          s.contractor.regionName,
          s.contractor.contractorCode ?? '',
          s.contractor.name,
          s.commodity.name,
          r.destinationCountry ?? '',
          Number(r.quantity ?? 0),
          r.unit ?? s.commodity.defaultUnit?.name ?? '',
          fobPhp,
          fobUsd,
          exchangeRate || '',
          exciseTaxRate ? `${(exciseTaxRate * 100).toFixed(0)}%` : '',
          exciseTaxPayable,
          r.isExport ? 'YES' : 'NO'
        ];

        values.forEach((v, i) => {
          row.getCell(i + 1).value = v as any;
          row.getCell(i + 1).border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
          row.getCell(i + 1).alignment = { vertical: 'top', wrapText: true };
        });
      }
    }

    await sendWorkbook(res, workbook, `Sales_${y}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  })
);

reportsRouter.get(
  '/export-by-country',
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthorized();
    await assertCanViewReport(req.user, ReportType.EXPORT_BY_COUNTRY);

    const { year, month, quarter, regionCode, commodityId, mineralType } = req.query as any;
    const y = Number(year) || new Date().getFullYear();

    const where: any = { year: y, status: SubmissionStatus.VERIFIED };
    if (month) where.month = Number(month);
    if (commodityId) where.commodityId = commodityId;

    if (req.user.role === UserRole.REGIONAL_ECONOMIST && req.user.regionCode) {
      where.contractor = { regionCode: req.user.regionCode };
    } else if (regionCode) {
      where.contractor = { regionCode };
    }

    if (mineralType) {
      where.commodity = { mineralType };
    }

    const submissions = await prisma.submission.findMany({
      where,
      include: { contractor: true, commodity: true }
    });

    const filtered = quarter
      ? submissions.filter((s) => s.month && Math.ceil((s.month ?? 1) / 3) === Number(quarter))
      : submissions;

    // Aggregate by country + commodity
    const agg: Record<string, { country: string; commodity: string; qty: number; php: number; usd: number }> = {};

    for (const s of filtered) {
      const sales: any = s.sales ?? {};
      const records: any[] = Array.isArray(sales.records) ? sales.records : [];
      for (const r of records) {
        if (!r.isExport) continue;
        const country = String(r.destinationCountry ?? '').trim() || 'Unknown';
        const key = `${country}__${s.commodity.name}`;
        if (!agg[key]) {
          agg[key] = { country, commodity: s.commodity.name, qty: 0, php: 0, usd: 0 };
        }
        agg[key].qty += Number(r.quantity ?? 0);
        agg[key].php += Number((r as any).fobValuePhp ?? (r as any).valuePhp ?? 0);
        agg[key].usd += Number((r as any).fobValueUsd ?? (r as any).valueUsd ?? 0);
      }
    }

    const columns = ['Year', 'Quarter', 'Country of Destination', 'Commodity', 'Total Qty', 'Total FOB Value (PHP)', 'Total FOB Value (USD)'];
    const { workbook, sheet, headerRowIndex } = createStandardSheet('PHILIPPINES MINERAL EXPORT BY COUNTRY OF DESTINATION', columns);

    let rowIndex = headerRowIndex + 1;
    for (const item of Object.values(agg).sort((a, b) => a.country.localeCompare(b.country))) {
      const row = sheet.getRow(rowIndex++);
      const values = [y, quarter ?? '', item.country, item.commodity, item.qty, item.php, item.usd];
      values.forEach((v, i) => {
        row.getCell(i + 1).value = v as any;
        row.getCell(i + 1).border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        row.getCell(i + 1).alignment = { vertical: 'top', wrapText: true };
      });
    }

    await sendWorkbook(res, workbook, `Export_By_Country_${y}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  })
);

reportsRouter.get(
  '/employment',
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthorized();
    await assertCanViewReport(req.user, ReportType.EMPLOYMENT);

    const { year, month, quarter, regionCode, commodityId, mineralType } = req.query as any;
    const y = Number(year) || new Date().getFullYear();

    const where: any = { year: y, status: SubmissionStatus.VERIFIED };
    if (month) where.month = Number(month);
    if (commodityId) where.commodityId = commodityId;

    if (req.user.role === UserRole.REGIONAL_ECONOMIST && req.user.regionCode) {
      where.contractor = { regionCode: req.user.regionCode };
    } else if (regionCode) {
      where.contractor = { regionCode };
    }

    if (mineralType) {
      where.commodity = { mineralType };
    }

    const submissions = await prisma.submission.findMany({
      where,
      include: { contractor: true, commodity: true }
    });

    const filtered = quarter
      ? submissions.filter((s) => s.month && Math.ceil((s.month ?? 1) / 3) === Number(quarter))
      : submissions;

    const columns = ['Year', 'Month', 'Quarter', 'Region', 'Contractor ID', 'Contractor/Company Name', 'Commodity', 'Male', 'Female', 'Total'];
    const { workbook, sheet, headerRowIndex } = createStandardSheet('EMPLOYMENT REPORT', columns);

    let rowIndex = headerRowIndex + 1;

    for (const s of filtered) {
      const emp: any = s.employment ?? {};
      // Data-entry form stores headOffice/mineSite split; support either schema.
      const totalMale = Number(emp.totalMale ?? (Number(emp.headOfficeMale ?? 0) + Number(emp.mineSiteMale ?? 0)));
      const totalFemale = Number(emp.totalFemale ?? (Number(emp.headOfficeFemale ?? 0) + Number(emp.mineSiteFemale ?? 0)));
      const total = totalMale + totalFemale;

      const row = sheet.getRow(rowIndex++);
      const qtr = s.month ? Math.ceil((s.month ?? 1) / 3) : '';
      const values = [
        s.year,
        s.month ?? '',
        qtr,
        s.contractor.regionName,
        s.contractor.contractorCode ?? '',
        s.contractor.name,
        s.commodity.name,
        totalMale,
        totalFemale,
        total
      ];

      values.forEach((v, i) => {
        row.getCell(i + 1).value = v as any;
        row.getCell(i + 1).border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        row.getCell(i + 1).alignment = { vertical: 'top', wrapText: true };
      });
    }

    await sendWorkbook(res, workbook, `Employment_${y}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  })
);
