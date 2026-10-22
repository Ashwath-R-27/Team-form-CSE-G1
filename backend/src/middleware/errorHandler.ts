import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

export class AppError extends Error {
  statusCode: number;
  code: string;
  details?: Record<string, any>;

  constructor(statusCode: number, code: string, message: string, details?: Record<string, any>) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.code,
      code: err.code,
      message: err.message,
      ...(err.details ? err.details : {}),
    });
    return;
  }

  if (err instanceof ZodError) {
    const firstIssue = err.issues[0];
    res.status(400).json({
      error: "VALIDATION_ERROR",
      code: "VALIDATION_ERROR",
      message: firstIssue
        ? `${firstIssue.path.join(".") ? firstIssue.path.join(".") + ": " : ""}${firstIssue.message}`
        : "Invalid request payload",
      issues: err.issues,
    });
    return;
  }

  console.error("[Unhandled Error]", err);
  res.status(500).json({
    error: "INTERNAL_SERVER_ERROR",
    code: "INTERNAL_SERVER_ERROR",
    message: err?.message || "An unexpected server error occurred.",
  });
}

