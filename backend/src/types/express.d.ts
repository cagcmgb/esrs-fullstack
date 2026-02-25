import 'express';
import { UserRole } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        name: string;
        role: UserRole;
        regionCode?: string | null;
      };
    }
  }
}

export {};
