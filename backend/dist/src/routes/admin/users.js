import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../../prisma.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
export const usersRouter = Router();
usersRouter.get('/', asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            name: true,
            email: true,
            username: true,
            role: true,
            regionCode: true,
            isActive: true,
            createdAt: true,
            updatedAt: true
        }
    });
    res.json(users);
}));
const createSchema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    username: z.string().min(2),
    role: z.enum(['ADMIN', 'CENTRAL_OFFICE', 'REGIONAL_ECONOMIST', 'GUEST']),
    regionCode: z.string().optional().nullable(),
    password: z.string().min(8)
});
usersRouter.post('/', asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = await prisma.user.create({
        data: {
            name: body.name,
            email: body.email,
            username: body.username,
            role: body.role,
            regionCode: body.regionCode ?? null,
            passwordHash
        },
        select: {
            id: true,
            name: true,
            email: true,
            username: true,
            role: true,
            regionCode: true,
            isActive: true,
            createdAt: true
        }
    });
    res.status(201).json(user);
}));
const updateSchema = z.object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    username: z.string().min(2).optional(),
    role: z.enum(['ADMIN', 'CENTRAL_OFFICE', 'REGIONAL_ECONOMIST', 'GUEST']).optional(),
    regionCode: z.string().optional().nullable(),
    isActive: z.boolean().optional(),
    password: z.string().min(8).optional()
});
usersRouter.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const body = updateSchema.parse(req.body);
    const data = {
        ...body
    };
    if (body.password) {
        data.passwordHash = await bcrypt.hash(body.password, 10);
        delete data.password;
    }
    const user = await prisma.user.update({
        where: { id },
        data,
        select: {
            id: true,
            name: true,
            email: true,
            username: true,
            role: true,
            regionCode: true,
            isActive: true,
            updatedAt: true
        }
    });
    res.json(user);
}));
usersRouter.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    // Soft delete
    await prisma.user.update({ where: { id }, data: { isActive: false } });
    res.json({ ok: true });
}));
