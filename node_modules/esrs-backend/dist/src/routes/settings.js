import { Router } from 'express';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { unauthorized } from '../utils/httpError.js';
export const settingsRouter = Router();
settingsRouter.get('/', requireAuth, asyncHandler(async (req, res) => {
    if (!req.user)
        throw unauthorized();
    const [permitTypes, statuses, units, commodities, reportPermissions, countries] = await Promise.all([
        prisma.permitType.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
        prisma.contractorStatus.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
        prisma.unit.findMany({ orderBy: { name: 'asc' } }),
        prisma.commodity.findMany({ where: { isActive: true }, include: { defaultUnit: true }, orderBy: { name: 'asc' } }),
        prisma.reportPermission.findMany({ where: { role: req.user.role } }),
        prisma.$queryRaw `SELECT "id","name" FROM "Country" WHERE "isActive" = true ORDER BY "sortOrder" ASC`
    ]);
    res.json({ permitTypes, statuses, units, commodities, reportPermissions, countries });
}));
