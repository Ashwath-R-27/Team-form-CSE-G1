import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { AdminRole, getAdminByEmail, getAdminById } from "../db/repository";
import { AppError } from "./errorHandler";

export interface AdminTokenPayload {
  id: string;
  email: string;
  role: AdminRole;
  created_at?: string;
}

declare global {
  namespace Express {
    interface Request {
      admin?: AdminTokenPayload;
    }
  }
}

export async function requireAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    let token: string | undefined;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    } else if (req.cookies?.admin_token) {
      token = req.cookies.admin_token;
    }

    if (!token) {
      throw new AppError(401, "UNAUTHORIZED", "Admin authentication required.");
    }

    const decoded = jwt.verify(token, config.jwtSecret) as AdminTokenPayload;
    if (!decoded || (decoded.role !== "admin" && decoded.role !== "super_admin")) {
      throw new AppError(403, "FORBIDDEN", "Invalid admin credentials.");
    }

    // Verify admin still exists in DB and sync role
    const dbAdmin = decoded.id
      ? await getAdminById(decoded.id)
      : await getAdminByEmail(decoded.email);

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
    next(new AppError(401, "UNAUTHORIZED", "Invalid or expired admin token."));
  }
}

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.admin || req.admin.role !== "super_admin") {
    next(new AppError(403, "FORBIDDEN", "Only a super admin can perform this action."));
    return;
  }
  next();
}
