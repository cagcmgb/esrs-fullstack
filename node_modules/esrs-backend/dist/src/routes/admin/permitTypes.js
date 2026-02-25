import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../prisma.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
export const permitTypesRouter = Router();
permitTypesRouter.get('/', asyncHandler(async (_req, res) => {
    const items = await prisma.permitType.findMany({ orderBy: { sortOrder: 'asc' } });
    res.json(items);
}));
const schema = z.object({
    name: z.string().min(1),
    isActive: z.boolean().optional().default(true),
    sortOrder: z.number().int().optional().default(0)
});
permitTypesRouter.post('/', asyncHandler(async (req, res) => {
    const body = schema.parse(req.body);
    const item = await prisma.permitType.create({ data: body });
    res.status(201).json(item);
}));
permitTypesRouter.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const body = schema.partial().parse(req.body);
    const item = await prisma.permitType.update({ where: { id }, data: body });
    res.json(item);
}));
permitTypesRouter.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    await prisma.permitType.update({ where: { id }, data: { isActive: false } });
    res.json({ ok: true });
}));
