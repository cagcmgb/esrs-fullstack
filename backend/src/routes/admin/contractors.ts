import { Router } from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { prisma } from '../../prisma.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { badRequest } from '../../utils/httpError.js';

export const adminContractorsRouter = Router();

const TEMPLATE_HEADERS = [
  'name',
  'tin',
  'operatorName',
  'contactNo',
  'email',
  'regionCode',
  'regionName',
  'provinceCode',
  'provinceName',
  'municipalityCode',
  'municipalityName',
  'areaHectare',
  'status',
  'commodities'
] as const;

const TEMPLATE_SAMPLE_ROW = [
  'ABC Mining Corp',
  '123456789012',
  'Juan Dela Cruz',
  '09171234567',
  'abc.mining@example.com',
  '020000000',
  'Region II (Cagayan Valley)',
  '021500000',
  'Cagayan',
  '021505000',
  'Tuguegarao City',
  '125.50',
  'Operating',
  'Gold|Copper'
] as const;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedMime = [
      'text/csv',
      'application/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    const lower = file.originalname.toLowerCase();
    const allowedExt = lower.endsWith('.csv') || lower.endsWith('.xlsx');
    if (allowedExt || allowedMime.includes(file.mimetype)) {
      cb(null, true);
      return;
    }

    cb(new Error('Only .csv or .xlsx files are allowed'));
  }
});

const bulkRowSchema = z.object({
  name: z.string().min(1),
  tin: z.string().min(1).refine((v) => v.replace(/\D/g, '').length === 12, { message: 'TIN must be a 12-digit corporate TIN' }),
  operatorName: z.string().min(1),
  contactNo: z.string().min(1),
  email: z.string().email(),
  regionCode: z.string().min(1),
  regionName: z.string().min(1),
  provinceCode: z.string().optional().nullable(),
  provinceName: z.string().min(1),
  municipalityCode: z.string().optional().nullable(),
  municipalityName: z.string().min(1),
  areaHectare: z.coerce.number().nonnegative(),
  status: z.string().min(1),
  commodities: z.string().min(1)
});

type RawRow = Record<string, string>;

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let value = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const ch = csvText[i];
    const next = csvText[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      current.push(value.trim());
      value = '';
      continue;
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i += 1;
      current.push(value.trim());
      value = '';
      const hasData = current.some((v) => v.length > 0);
      if (hasData) rows.push(current);
      current = [];
      continue;
    }

    value += ch;
  }

  if (value.length > 0 || current.length > 0) {
    current.push(value.trim());
    const hasData = current.some((v) => v.length > 0);
    if (hasData) rows.push(current);
  }

  return rows;
}

async function readRowsFromFile(file: Express.Multer.File): Promise<RawRow[]> {
  const fileName = file.originalname.toLowerCase();

  let matrix: string[][] = [];
  if (fileName.endsWith('.xlsx')) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];

    matrix = sheet.getSheetValues().slice(1).map((row) => {
      if (!Array.isArray(row)) return [];
      return row.slice(1).map((cell) => cellToString(cell));
    });
  } else {
    const text = file.buffer.toString('utf-8');
    matrix = parseCsvRows(text);
  }

  if (matrix.length === 0) return [];

  const header = matrix[0].map((h) => normalizeHeader(cellToString(h)));
  const rows = matrix.slice(1);

  return rows
    .map((r) => {
      const obj: RawRow = {};
      for (let i = 0; i < header.length; i += 1) {
        const key = header[i];
        if (!key) continue;
        obj[key] = cellToString(r[i]);
      }
      return obj;
    })
    .filter((r) => Object.values(r).some((v) => String(v).trim().length > 0));
}

function splitList(value: string): string[] {
  return value
    .split(/[|,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function toUpperTrim(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  return String(value).trim().toUpperCase();
}

adminContractorsRouter.get(
  '/import-template',
  asyncHandler(async (req, res) => {
    const format = String(req.query.format ?? 'csv').toLowerCase();
    const withSample = String(req.query.sample ?? 'false').toLowerCase() === 'true';

    if (format === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Contractors');
      sheet.addRow([...TEMPLATE_HEADERS]);
      if (withSample) {
        sheet.addRow([...TEMPLATE_SAMPLE_ROW]);
      }
      sheet.getRow(1).font = { bold: true };
      TEMPLATE_HEADERS.forEach((h, idx) => {
        sheet.getColumn(idx + 1).width = Math.max(16, h.length + 4);
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="contractor_bulk_template${withSample ? '_sample' : ''}.xlsx"`);
      await workbook.xlsx.write(res);
      res.end();
      return;
    }

    if (format !== 'csv') {
      throw badRequest('Invalid format. Use csv or xlsx.');
    }

    const csv = withSample
      ? `${TEMPLATE_HEADERS.join(',')}\n${TEMPLATE_SAMPLE_ROW.join(',')}\n`
      : `${TEMPLATE_HEADERS.join(',')}\n`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="contractor_bulk_template${withSample ? '_sample' : ''}.csv"`);
    res.status(200).send(csv);
  })
);

adminContractorsRouter.post(
  '/import',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw badRequest('Unauthorized');
    }

    if (!req.file) {
      throw badRequest('No file uploaded. Use form-data with field name "file".');
    }

    const rawRows = await readRowsFromFile(req.file);
    if (rawRows.length === 0) {
      throw badRequest('The uploaded file has no data rows.');
    }

    const statuses = await prisma.contractorStatus.findMany({ where: { isActive: true } });
    const commodities = await prisma.commodity.findMany({ where: { isActive: true } });

    const statusMap = new Map<string, string>();
    for (const s of statuses) {
      statusMap.set(s.id.toLowerCase(), s.id);
      statusMap.set(s.name.toLowerCase(), s.id);
    }

    const commodityMap = new Map<string, string>();
    for (const c of commodities) {
      commodityMap.set(c.id.toLowerCase(), c.id);
      commodityMap.set(c.name.toLowerCase(), c.id);
    }

    const failures: Array<{ rowNumber: number; message: string }> = [];
    let createdCount = 0;

    for (let index = 0; index < rawRows.length; index += 1) {
      const rowNumber = index + 2;
      const row = rawRows[index];

      try {
        const parsed = bulkRowSchema.parse({
          name: row.name ?? row.contractorname,
          tin: row.tin,
          operatorName: row.operatorname,
          contactNo: row.contactno,
          email: row.email,
          regionCode: row.regioncode,
          regionName: row.regionname,
          provinceCode: row.provincecode || null,
          provinceName: row.provincename,
          municipalityCode: row.municipalitycode || null,
          municipalityName: row.municipalityname,
          areaHectare: row.areahectare,
          status: row.status,
          commodities: row.commodities
        });

        const statusRaw = String(parsed.status).trim();
        const statusId = statusMap.get(statusRaw.toLowerCase());
        if (!statusId) {
          const allowedStatuses = statuses.map((s) => s.name).sort((a, b) => a.localeCompare(b)).join(', ');
          throw new Error(`Unknown status: "${statusRaw}". Allowed statuses: ${allowedStatuses}`);
        }

        const commodityValues = splitList(parsed.commodities);
        const unknownCommodities: string[] = [];
        const resolvedCommodityIds: string[] = [];

        for (const item of commodityValues) {
          const resolved = commodityMap.get(item.toLowerCase());
          if (!resolved) {
            unknownCommodities.push(item);
            continue;
          }
          resolvedCommodityIds.push(resolved);
        }

        if (unknownCommodities.length > 0) {
          const allowedCommodities = commodities.map((c) => c.name).sort((a, b) => a.localeCompare(b)).join(', ');
          throw new Error(`Unknown commodity value(s): ${unknownCommodities.join(', ')}. Allowed commodities: ${allowedCommodities}`);
        }

        const commodityIds = Array.from(new Set(resolvedCommodityIds));

        if (commodityIds.length === 0) {
          throw new Error('At least one commodity is required');
        }

        const normalized = {
          name: toUpperTrim(parsed.name) ?? parsed.name,
          tin: toUpperTrim(parsed.tin) ?? parsed.tin,
          operatorName: toUpperTrim(parsed.operatorName) ?? parsed.operatorName,
          contactNo: toUpperTrim(parsed.contactNo) ?? parsed.contactNo,
          email: toUpperTrim(parsed.email) ?? parsed.email,
          regionCode: toUpperTrim(parsed.regionCode) ?? parsed.regionCode,
          regionName: toUpperTrim(parsed.regionName) ?? parsed.regionName,
          provinceCode: toUpperTrim(parsed.provinceCode) ?? parsed.provinceCode,
          provinceName: toUpperTrim(parsed.provinceName) ?? parsed.provinceName,
          municipalityCode: toUpperTrim(parsed.municipalityCode) ?? parsed.municipalityCode,
          municipalityName: toUpperTrim(parsed.municipalityName) ?? parsed.municipalityName
        };

        await prisma.contractor.create({
          data: {
            name: normalized.name,
            tin: normalized.tin,
            operatorName: normalized.operatorName,
            contactNo: normalized.contactNo,
            email: normalized.email,
            regionCode: normalized.regionCode,
            regionName: normalized.regionName,
            provinceCode: normalized.provinceCode ?? null,
            provinceName: normalized.provinceName,
            municipalityCode: normalized.municipalityCode ?? null,
            municipalityName: normalized.municipalityName,
            areaHectare: parsed.areaHectare,
            statusId,
            createdById: req.user.id,
            contractorCommodities: {
              create: commodityIds.map((commodityId) => ({ commodityId }))
            }
          }
        });

        createdCount += 1;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Invalid row';
        failures.push({ rowNumber, message: msg });
      }
    }

    res.json({
      totalRows: rawRows.length,
      createdCount,
      failedCount: failures.length,
      failures
    });
  })
);
