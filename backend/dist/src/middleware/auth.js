import jwt from 'jsonwebtoken';
import { env } from '../config.js';
import { forbidden, unauthorized } from '../utils/httpError.js';
import { UserRole } from '@prisma/client';
export const requireAuth = (req, _res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next(unauthorized());
    }
    const token = authHeader.slice('Bearer '.length);
    try {
        const decoded = jwt.verify(token, env.JWT_SECRET);
        req.user = {
            id: decoded.sub,
            name: decoded.name,
            role: decoded.role,
            regionCode: decoded.regionCode ?? null
        };
        return next();
    }
    catch {
        return next(unauthorized('Invalid or expired token'));
    }
};
export function requireRole(roles) {
    return (req, _res, next) => {
        if (!req.user)
            return next(unauthorized());
        if (!roles.includes(req.user.role)) {
            return next(forbidden());
        }
        return next();
    };
}
export function requireSelfOrRoles(userIdParam, roles) {
    return (req, _res, next) => {
        if (!req.user)
            return next(unauthorized());
        const id = req.params[userIdParam];
        if (req.user.id === id)
            return next();
        if (!roles.includes(req.user.role))
            return next(forbidden());
        return next();
    };
}
export function restrictToUserRegion(regionCodeField = 'regionCode') {
    // Intended for Regional Economist access scoping.
    return (req, _res, next) => {
        if (!req.user)
            return next(unauthorized());
        if (req.user.role !== UserRole.REGIONAL_ECONOMIST)
            return next();
        const userRegion = req.user.regionCode;
        if (!userRegion)
            return next(forbidden('Regional Economist user missing regionCode'));
        // If the route includes a regionCode param, enforce it.
        const regionFromParams = req.params[regionCodeField];
        if (regionFromParams && regionFromParams !== userRegion) {
            return next(forbidden('You can only access your assigned region'));
        }
        return next();
    };
}
