import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../prisma.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
export const unitsRouter = Router();
unitsRouter.get('/', asyncHandler(async (_req, res) => {
    const items = await prisma.unit.findMany({ orderBy: { name: 'asc' } });
    res.json(items);
}));
const schema = z.object({
    name: z.string().min(1),
    symbol: z.string().optional().nullable()
});
unitsRouter.post('/', asyncHandler(async (req, res) => {
    const body = schema.parse(req.body);
    const item = await prisma.unit.create({ data: { name: body.name, symbol: body.symbol ?? null } });
    res.status(201).json(item);
}));
unitsRouter.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const body = schema.partial().parse(req.body);
    const item = await prisma.unit.update({ where: { id }, data: { ...body } });
    res.json(item);
}));
unitsRouter.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    // Units may be referenced; prefer soft delete in real systems.
    await prisma.unit.delete({ where: { id } });
    res.json({ ok: true });
}));
