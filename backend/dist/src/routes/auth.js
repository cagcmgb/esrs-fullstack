import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { env } from '../config.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { badRequest, unauthorized } from '../utils/httpError.js';
import { requireAuth } from '../middleware/auth.js';
export const authRouter = Router();
const loginSchema = z.object({
    usernameOrEmail: z.string().min(1),
    password: z.string().min(1)
});
authRouter.post('/login', asyncHandler(async (req, res) => {
    const { usernameOrEmail, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findFirst({
        where: {
            isActive: true,
            OR: [{ username: usernameOrEmail }, { email: usernameOrEmail }]
        }
    });
    if (!user)
        throw unauthorized('Invalid credentials');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok)
        throw unauthorized('Invalid credentials');
    const token = jwt.sign({
        sub: user.id,
        name: user.name,
        role: user.role,
        regionCode: user.regionCode
    }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
    res.json({
        token,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            username: user.username,
            role: user.role,
            regionCode: user.regionCode
        }
    });
}));
authRouter.get('/me', requireAuth, asyncHandler(async (req, res) => {
    if (!req.user)
        throw unauthorized();
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user)
        throw unauthorized();
    res.json({
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        role: user.role,
        regionCode: user.regionCode,
        isActive: user.isActive
    });
}));
// Optional: admin can set a new password for a user (kept for future)
const changePasswordSchema = z.object({
    userId: z.string().min(1),
    newPassword: z.string().min(8)
});
authRouter.post('/change-password', requireAuth, asyncHandler(async (req, res) => {
    // This endpoint intentionally requires ADMIN. We keep it simple here.
    if (!req.user)
        throw unauthorized();
    if (req.user.role !== 'ADMIN')
        throw badRequest('Only ADMIN can change passwords');
    const { userId, newPassword } = changePasswordSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
        where: { id: userId },
        data: { passwordHash }
    });
    res.json({ ok: true });
}));
