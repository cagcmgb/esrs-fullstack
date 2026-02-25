import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../prisma.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
export const regionConfigsRouter = Router();
regionConfigsRouter.get('/', asyncHandler(async (_req, res) => {
    const items = await prisma.regionConfig.findMany({ orderBy: { regionCode: 'asc' } });
    res.json(items);
}));
const schema = z.object({
    regionCode: z.string().min(1),
    name: z.string().min(1),
    idPrefix: z.string().min(1),
    nextSequence: z.number().int().min(1).optional()
});
regionConfigsRouter.put('/', asyncHandler(async (req, res) => {
    const body = schema.parse(req.body);
    const item = await prisma.regionConfig.upsert({
        where: { regionCode: body.regionCode },
        update: {
            name: body.name,
            idPrefix: body.idPrefix,
            ...(body.nextSequence ? { nextSequence: body.nextSequence } : {})
        },
        create: {
            regionCode: body.regionCode,
            name: body.name,
            idPrefix: body.idPrefix,
            nextSequence: body.nextSequence ?? 1
        }
    });
    res.json(item);
}));
