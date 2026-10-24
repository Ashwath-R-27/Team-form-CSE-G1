import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { AdminRole, getAdminById } from "../db/repository";
import { AppError } from "./errorHandler";

export interface AdminJwtPayload {
  id: string;
  role: AdminRole;
}

export interface AuthenticatedAdmin {
  id: string;
  email: string;
  role: AdminRole;
  created_at?: string;
}

declare global {
  namespace Express {
    interface Request {
      admin?: AuthenticatedAdmin;
    }
  }
}

export async function requireAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !/^Bearer\s+/i.test(authHeader)) {
      throw new AppError(401, "UNAUTHORIZED", "Missing or invalid Authorization header.");
    }

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      throw new AppError(401, "UNAUTHORIZED", "Missing authentication token.");
    }

    const decoded = jwt.verify(token, config.jwtSecret) as AdminJwtPayload;
    if (
      !decoded ||
      typeof decoded !== "object" ||
      typeof decoded.id !== "string" ||
      !decoded.id ||
      (decoded.role !== "admin" && decoded.role !== "super_admin")
    ) {
      throw new AppError(401, "UNAUTHORIZED", "Invalid authentication token.");
    }

    // Reload admin from Supabase so deleted admins immediately lose access and role stays in sync
    const dbAdmin = await getAdminById(decoded.id);
    if (!dbAdmin) {
      throw new AppError(401, "UNAUTHORIZED", "Admin account no longer exists.");
    }

    req.admin = {
      id: dbAdmin.id,
      email: dbAdmin.email,
      role: dbAdmin.role,
      created_at: dbAdmin.created_at,
    };
    next();
  } catch (err) {
    if (err instanceof AppError) {
      next(err);
      return;
    }
    next(new AppError(401, "UNAUTHORIZED", "Invalid or expired authentication token."));
  }
}

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.admin || req.admin.role !== "super_admin") {
    next(new AppError(403, "FORBIDDEN", "Only a super admin can perform this action."));
    return;
  }
  next();
}
