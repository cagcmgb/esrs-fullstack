import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../prisma.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
export const reportPermissionsRouter = Router();
reportPermissionsRouter.get('/', asyncHandler(async (_req, res) => {
    const items = await prisma.reportPermission.findMany({ orderBy: [{ role: 'asc' }, { reportType: 'asc' }] });
    res.json(items);
}));
const schema = z.object({
    role: z.enum(['ADMIN', 'CENTRAL_OFFICE', 'REGIONAL_ECONOMIST', 'GUEST']),
    reportType: z.enum(['OPERATING_MINES', 'DIRECTORY', 'PRODUCTION', 'SALES', 'EXPORT_BY_COUNTRY', 'EMPLOYMENT']),
    canView: z.boolean()
});
reportPermissionsRouter.put('/', asyncHandler(async (req, res) => {
    const body = schema.parse(req.body);
    const item = await prisma.reportPermission.upsert({
        where: { role_reportType: { role: body.role, reportType: body.reportType } },
        update: { canView: body.canView },
        create: { role: body.role, reportType: body.reportType, canView: body.canView }
    });
    res.json(item);
}));
reportPermissionsRouter.delete('/:role/:reportType', asyncHandler(async (req, res) => {
    const { role, reportType } = req.params;
    await prisma.reportPermission.deleteMany({ where: { role: role, reportType: reportType } });
    res.json({ ok: true });
}));
