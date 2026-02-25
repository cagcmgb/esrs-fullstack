import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../prisma.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
export const countriesRouter = Router();
countriesRouter.get('/', asyncHandler(async (_req, res) => {
    const items = await prisma.$queryRaw `SELECT "id","name","isActive","sortOrder","createdAt" FROM "Country" ORDER BY "sortOrder" ASC`;
    res.json(items);
}));
const schema = z.object({
    name: z.string().min(1),
    isActive: z.boolean().optional().default(true),
    sortOrder: z.number().int().optional().default(0)
});
countriesRouter.post('/', asyncHandler(async (req, res) => {
    const body = schema.parse(req.body);
    const id = String(Date.now()) + Math.random().toString(36).slice(2);
    const row = (await prisma.$queryRawUnsafe(`INSERT INTO "Country" ("id","name","isActive","sortOrder","createdAt") VALUES ($1,$2,$3,$4,now()) RETURNING *`, id, body.name, body.isActive, body.sortOrder));
    res.status(201).json(row[0] ?? row);
}));
countriesRouter.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const body = schema.partial().parse(req.body);
    const row = (await prisma.$queryRawUnsafe(`UPDATE "Country" SET "name" = $2, "isActive" = $3, "sortOrder" = $4 WHERE "id" = $1 RETURNING *`, id, body.name ?? undefined, body.isActive ?? undefined, body.sortOrder ?? undefined));
    res.json(row[0] ?? row);
}));
countriesRouter.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    await prisma.$executeRawUnsafe(`UPDATE "Country" SET "isActive" = false WHERE "id" = $1`, id);
    res.json({ ok: true });
}));
