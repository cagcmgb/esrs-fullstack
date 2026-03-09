import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../prisma.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const countriesRouter = Router();

countriesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const items = await prisma.country.findMany({ orderBy: { sortOrder: 'asc' } });
    res.json(items);
  })
);

const schema = z.object({
  name: z.string().min(1),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0)
});

countriesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = schema.parse(req.body);
    const item = await prisma.country.create({ data: { name: body.name, isActive: body.isActive ?? true, sortOrder: body.sortOrder ?? 0 } });
    res.status(201).json(item);
  })
);

countriesRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const body = schema.partial().parse(req.body);
    const item = await prisma.country.update({ where: { id }, data: { ...(body as any) } });
    res.json(item);
  })
);

countriesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    await prisma.country.update({ where: { id }, data: { isActive: false } });
    res.json({ ok: true });
  })
);
