import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../prisma.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
export const commoditiesRouter = Router();
commoditiesRouter.get('/', asyncHandler(async (_req, res) => {
    const items = await prisma.commodity.findMany({
        include: { defaultUnit: true },
        orderBy: { name: 'asc' }
    });
    res.json(items);
}));
const schema = z.object({
    name: z.string().min(1),
    mineralType: z.enum(['METALLIC', 'NON_METALLIC']),
    defaultUnitId: z.string().optional().nullable(),
    formTemplateCode: z.string().optional().nullable(),
    category: z.string().optional().nullable(),
    isActive: z.boolean().optional().default(true)
});
commoditiesRouter.post('/', asyncHandler(async (req, res) => {
    const body = schema.parse(req.body);
    const item = await prisma.commodity.create({ data: { ...body, defaultUnitId: body.defaultUnitId ?? null, formTemplateCode: body.formTemplateCode ?? null } });
    res.status(201).json(item);
}));
commoditiesRouter.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const body = schema.partial().parse(req.body);
    const item = await prisma.commodity.update({ where: { id }, data: { ...body } });
    res.json(item);
}));
commoditiesRouter.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    await prisma.commodity.update({ where: { id }, data: { isActive: false } });
    res.json({ ok: true });
}));
