import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config.js';
import { forbidden, unauthorized } from '../utils/httpError.js';
import { UserRole } from '@prisma/client';

type JwtPayload = {
  sub: string;
  name: string;
  role: UserRole;
  regionCode?: string | null;
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(unauthorized());
  }

  const token = authHeader.slice('Bearer '.length);
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = {
      id: decoded.sub,
      name: decoded.name,
      role: decoded.role,
      regionCode: decoded.regionCode ?? null
    };
    return next();
  } catch {
    return next(unauthorized('Invalid or expired token'));
  }
};

export function requireRole(roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(forbidden());
    }
    return next();
  };
}

export function requireSelfOrRoles(userIdParam: string, roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    const id = req.params[userIdParam];
    if (req.user.id === id) return next();
    if (!roles.includes(req.user.role)) return next(forbidden());
    return next();
  };
}

export function restrictToUserRegion(regionCodeField: string = 'regionCode'): RequestHandler {
  // Intended for Regional Economist access scoping.
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (req.user.role !== UserRole.REGIONAL_ECONOMIST) return next();

    const userRegion = req.user.regionCode;
    if (!userRegion) return next(forbidden('Regional Economist user missing regionCode'));

    // If the route includes a regionCode param, enforce it.
    const regionFromParams = (req.params as any)[regionCodeField] as string | undefined;
    if (regionFromParams && regionFromParams !== userRegion) {
      return next(forbidden('You can only access your assigned region'));
    }

    return next();
  };
}
