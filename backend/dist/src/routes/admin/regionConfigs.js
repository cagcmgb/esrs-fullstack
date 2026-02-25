import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../prisma.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
export const regionConfigsRouter = Router();
regionConfigsRouter.get('/', asyncHandler(async (_req, res) => {
    const items = await prisma.regionConfig.findMany({ orderBy: { regionCode: 'asc' } });
    // Map DB `regionName` field to API `name` for frontend compatibility
    res.json(items.map((it) => ({
        regionCode: it.regionCode,
        name: it.regionName,
        idPrefix: it.idPrefix,
        nextSequence: it.nextSequence
    })));
}));
const schema = z.object({
    regionCode: z.string().min(1),
    name: z.string().min(1),
    idPrefix: z.string().min(1),
    nextSequence: z.number().int().min(1).optional()
});
regionConfigsRouter.put('/', asyncHandler(async (req, res) => {
    // Keep existing upsert behaviour when caller provides full payload including regionCode
    const body = schema.parse(req.body);
    const item = await prisma.regionConfig.upsert({
        where: { regionCode: body.regionCode },
        update: {
            regionName: body.name,
            idPrefix: body.idPrefix,
            ...(body.nextSequence ? { nextSequence: body.nextSequence } : {})
        },
        create: {
            regionCode: body.regionCode,
            regionName: body.name,
            idPrefix: body.idPrefix,
            nextSequence: body.nextSequence ?? 1
        }
    });
    res.json({ regionCode: item.regionCode, name: item.regionName, idPrefix: item.idPrefix, nextSequence: item.nextSequence });
}));
// Allow updating a specific region by regionCode in the URL (matches frontend Admin.saveRegion)
regionConfigsRouter.put('/:regionCode', asyncHandler(async (req, res) => {
    const regionCode = req.params.regionCode;
    const body = z.object({ name: z.string().min(1), idPrefix: z.string().min(1), nextSequence: z.number().int().min(1).optional() }).parse(req.body);
    const item = await prisma.regionConfig.upsert({
        where: { regionCode },
        update: {
            regionName: body.name,
            idPrefix: body.idPrefix,
            ...(body.nextSequence ? { nextSequence: body.nextSequence } : {})
        },
        create: {
            regionCode,
            regionName: body.name,
            idPrefix: body.idPrefix,
            nextSequence: body.nextSequence ?? 1
        }
    });
    res.json({ regionCode: item.regionCode, name: item.regionName, idPrefix: item.idPrefix, nextSequence: item.nextSequence });
}));
// Delete a region config
regionConfigsRouter.delete('/:regionCode', asyncHandler(async (req, res) => {
    const regionCode = req.params.regionCode;
    await prisma.regionConfig.deleteMany({ where: { regionCode } });
    res.json({ ok: true });
}));
