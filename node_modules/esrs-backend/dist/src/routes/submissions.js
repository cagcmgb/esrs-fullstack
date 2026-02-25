import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma } from '../prisma.js';
import { env } from '../config.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { UserRole, SubmissionStatus, PeriodType } from '@prisma/client';
import { badRequest, forbidden, notFound, unauthorized } from '../utils/httpError.js';
export const submissionsRouter = Router();
submissionsRouter.use(requireAuth);
function ensureUploadDir() {
    const dir = env.UPLOAD_DIR;
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
    return dir;
}
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, ensureUploadDir());
    },
    filename: (_req, file, cb) => {
        const safeBase = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        const unique = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
        cb(null, `${unique}__${safeBase}`);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 }
});
submissionsRouter.get('/', asyncHandler(async (req, res) => {
    if (!req.user)
        throw unauthorized();
    const { contractorId, year, month, status } = req.query;
    const where = {};
    if (contractorId)
        where.contractorId = contractorId;
    if (year)
        where.year = Number(year);
    if (month)
        where.month = Number(month);
    if (status)
        where.status = status;
    // Regional economists only see their region.
    if (req.user.role === UserRole.REGIONAL_ECONOMIST && req.user.regionCode) {
        where.contractor = { regionCode: req.user.regionCode };
    }
    const items = await prisma.submission.findMany({
        where,
        include: {
            contractor: true,
            commodity: { include: { defaultUnit: true } },
            attachments: true,
            createdBy: { select: { id: true, name: true, role: true } },
            verifiedBy: { select: { id: true, name: true, role: true } }
        },
        orderBy: { createdAt: 'desc' }
    });
    res.json(items);
}));
submissionsRouter.delete('/:id', asyncHandler(async (req, res) => {
    if (!req.user)
        throw unauthorized();
    // Admin and Central Office can delete (Central Office limited to VERIFIED submissions)
    if (!(req.user.role === UserRole.ADMIN || req.user.role === UserRole.CENTRAL_OFFICE)) {
        throw forbidden('Only Admin/Central Office can delete submissions');
    }
    const existing = await prisma.submission.findUnique({ where: { id: req.params.id } });
    if (!existing)
        throw notFound('Submission not found');
    if (req.user.role === UserRole.CENTRAL_OFFICE && existing.status !== SubmissionStatus.VERIFIED) {
        throw forbidden('Central Office can only delete VERIFIED submissions');
    }
    await prisma.submission.delete({ where: { id: existing.id } });
    res.json({ ok: true });
}));
// Paginated verified submissions for reviewers (server-side pagination)
submissionsRouter.get('/verified', asyncHandler(async (req, res) => {
    if (!req.user)
        throw unauthorized();
    const { year, month, quarter, regionCode, commodityId, mineralType, page = '1', limit = '10' } = req.query;
    const y = Number(year) || new Date().getFullYear();
    const p = Math.max(1, Number(page) || 1);
    const l = Math.max(1, Math.min(100, Number(limit) || 10));
    const where = { year: y, status: SubmissionStatus.VERIFIED };
    if (month)
        where.month = Number(month);
    if (commodityId)
        where.commodityId = commodityId;
    if (req.user.role === UserRole.REGIONAL_ECONOMIST && req.user.regionCode) {
        where.contractor = { regionCode: req.user.regionCode };
    }
    else if (regionCode) {
        where.contractor = { regionCode };
    }
    if (mineralType) {
        where.commodity = { mineralType };
    }
    const total = await prisma.submission.count({ where });
    const items = await prisma.submission.findMany({
        where,
        include: {
            contractor: true,
            commodity: { include: { defaultUnit: true } },
            attachments: true,
            createdBy: { select: { id: true, name: true, role: true } },
            verifiedBy: { select: { id: true, name: true, role: true } }
        },
        orderBy: { verifiedAt: 'desc' },
        skip: (p - 1) * l,
        take: l
    });
    res.json({ items, total, page: p, limit: l });
}));
const createSchema = z.object({
    contractorId: z.string().min(1),
    commodityId: z.string().min(1),
    year: z.number().int().min(1900),
    month: z.number().int().min(1).max(12),
    administrative: z.any().optional().nullable(),
    production: z.any().optional().nullable(),
    sales: z.any().optional().nullable(),
    employment: z.any().optional().nullable()
});
submissionsRouter.post('/', asyncHandler(async (req, res) => {
    if (!req.user)
        throw unauthorized();
    if (!(req.user.role === UserRole.ADMIN || req.user.role === UserRole.REGIONAL_ECONOMIST)) {
        throw forbidden('Only Regional Economist/Admin can encode data');
    }
    const body = createSchema.parse(req.body);
    // Ensure contractor exists + is verified.
    const contractor = await prisma.contractor.findUnique({ where: { id: body.contractorId } });
    if (!contractor)
        throw notFound('Contractor not found');
    if (!contractor.isVerified)
        throw badRequest('Contractor must be verified before encoding data');
    if (req.user.role === UserRole.REGIONAL_ECONOMIST && req.user.regionCode && contractor.regionCode !== req.user.regionCode) {
        throw forbidden('You can only encode data for contractors in your region');
    }
    const item = await prisma.submission.create({
        data: {
            contractorId: body.contractorId,
            commodityId: body.commodityId,
            periodType: PeriodType.MONTHLY,
            year: body.year,
            month: body.month,
            status: SubmissionStatus.DRAFT,
            administrative: body.administrative ?? null,
            production: body.production ?? null,
            sales: body.sales ?? null,
            employment: body.employment ?? null,
            createdById: req.user.id
        },
        include: {
            contractor: true,
            commodity: { include: { defaultUnit: true } },
            attachments: true
        }
    });
    res.status(201).json(item);
}));
const updateSchema = createSchema.partial().omit({ contractorId: true, commodityId: true });
submissionsRouter.put('/:id', asyncHandler(async (req, res) => {
    if (!req.user)
        throw unauthorized();
    if (!(req.user.role === UserRole.ADMIN || req.user.role === UserRole.CENTRAL_OFFICE || req.user.role === UserRole.REGIONAL_ECONOMIST)) {
        throw forbidden();
    }
    const existing = await prisma.submission.findUnique({
        where: { id: req.params.id },
        include: { contractor: true }
    });
    if (!existing)
        throw notFound('Submission not found');
    // ADMIN may edit any submission.
    // CENTRAL_OFFICE may edit VERIFIED submissions (to fix discrepancies after verification).
    // REGIONAL_ECONOMIST may edit only DRAFT submissions.
    if (req.user.role === UserRole.REGIONAL_ECONOMIST) {
        if (existing.status !== SubmissionStatus.DRAFT) {
            throw badRequest('Only DRAFT submissions can be edited');
        }
    }
    if (req.user.role === UserRole.CENTRAL_OFFICE) {
        if (existing.status !== SubmissionStatus.VERIFIED) {
            throw badRequest('Only VERIFIED submissions can be edited by Central Office');
        }
    }
    if (req.user.role === UserRole.REGIONAL_ECONOMIST && req.user.regionCode && existing.contractor.regionCode !== req.user.regionCode) {
        throw forbidden('You can only edit submissions in your region');
    }
    const body = updateSchema.parse(req.body);
    const item = await prisma.submission.update({
        where: { id: existing.id },
        data: {
            ...body,
            administrative: body.administrative === undefined ? undefined : body.administrative,
            production: body.production === undefined ? undefined : body.production,
            sales: body.sales === undefined ? undefined : body.sales,
            employment: body.employment === undefined ? undefined : body.employment
        },
        include: {
            contractor: true,
            commodity: { include: { defaultUnit: true } },
            attachments: true
        }
    });
    res.json(item);
}));
submissionsRouter.post('/:id/submit', asyncHandler(async (req, res) => {
    if (!req.user)
        throw unauthorized();
    if (!(req.user.role === UserRole.ADMIN || req.user.role === UserRole.REGIONAL_ECONOMIST)) {
        throw forbidden();
    }
    const existing = await prisma.submission.findUnique({
        where: { id: req.params.id },
        include: { contractor: true }
    });
    if (!existing)
        throw notFound('Submission not found');
    if (existing.status !== SubmissionStatus.DRAFT) {
        throw badRequest('Only DRAFT submissions can be submitted');
    }
    if (req.user.role === UserRole.REGIONAL_ECONOMIST && req.user.regionCode && existing.contractor.regionCode !== req.user.regionCode) {
        throw forbidden('You can only submit submissions in your region');
    }
    const item = await prisma.submission.update({
        where: { id: existing.id },
        data: { status: SubmissionStatus.SUBMITTED, submittedAt: new Date() },
        include: { contractor: true, commodity: true, attachments: true }
    });
    res.json(item);
}));
const rejectSchema = z.object({ reason: z.string().min(1) });
submissionsRouter.post('/:id/reject', asyncHandler(async (req, res) => {
    if (!req.user)
        throw unauthorized();
    if (!(req.user.role === UserRole.ADMIN || req.user.role === UserRole.CENTRAL_OFFICE)) {
        throw forbidden('Only Central Office/Admin can reject submissions');
    }
    const existing = await prisma.submission.findUnique({ where: { id: req.params.id } });
    if (!existing)
        throw notFound('Submission not found');
    const { reason } = rejectSchema.parse(req.body);
    const item = await prisma.submission.update({
        where: { id: existing.id },
        data: { status: SubmissionStatus.REJECTED, rejectedReason: reason, verifiedById: req.user.id, verifiedAt: new Date() }
    });
    res.json(item);
}));
submissionsRouter.post('/:id/verify', asyncHandler(async (req, res) => {
    if (!req.user)
        throw unauthorized();
    if (!(req.user.role === UserRole.ADMIN || req.user.role === UserRole.CENTRAL_OFFICE)) {
        throw forbidden('Only Central Office/Admin can verify submissions');
    }
    const existing = await prisma.submission.findUnique({ where: { id: req.params.id } });
    if (!existing)
        throw notFound('Submission not found');
    if (existing.status !== SubmissionStatus.SUBMITTED) {
        throw badRequest('Only SUBMITTED submissions can be verified');
    }
    const item = await prisma.submission.update({
        where: { id: existing.id },
        data: { status: SubmissionStatus.VERIFIED, verifiedById: req.user.id, verifiedAt: new Date() }
    });
    res.json(item);
}));
submissionsRouter.post('/:id/attachments', upload.single('file'), asyncHandler(async (req, res) => {
    if (!req.user)
        throw unauthorized();
    const existing = await prisma.submission.findUnique({
        where: { id: req.params.id },
        include: { contractor: true }
    });
    if (!existing)
        throw notFound('Submission not found');
    if (req.user.role === UserRole.REGIONAL_ECONOMIST && req.user.regionCode && existing.contractor.regionCode !== req.user.regionCode) {
        throw forbidden('You can only upload attachments for your region');
    }
    if (!req.file)
        throw badRequest('No file uploaded');
    const record = await prisma.attachment.create({
        data: {
            submissionId: existing.id,
            originalName: req.file.originalname,
            mimeType: req.file.mimetype,
            fileName: req.file.filename,
            filePath: path.resolve(env.UPLOAD_DIR, req.file.filename),
            sizeBytes: req.file.size
        }
    });
    res.status(201).json(record);
}));
submissionsRouter.get('/:id/attachments/:attachmentId/download', asyncHandler(async (req, res) => {
    if (!req.user)
        throw unauthorized();
    const { id, attachmentId } = req.params;
    const attachment = await prisma.attachment.findFirst({
        where: { id: attachmentId, submissionId: id },
        include: { submission: { include: { contractor: true } } }
    });
    if (!attachment)
        throw notFound('Attachment not found');
    if (req.user.role === UserRole.REGIONAL_ECONOMIST && req.user.regionCode && attachment.submission.contractor.regionCode !== req.user.regionCode) {
        throw forbidden('You can only download attachments for your region');
    }
    res.download(attachment.filePath, attachment.originalName);
}));
