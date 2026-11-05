import { Prisma } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { logger } from "../config/logger";

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`
  });
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  if (res.headersSent) return;

  if (error instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: error.errors.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    });
  }

  if (error instanceof AppError) {
    return res.status(error.status).json({
      success: false,
      message: error.message,
      code: error.code
    });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      const target = Array.isArray(error.meta?.target)
        ? (error.meta?.target as string[]).join(", ")
        : "unique field";
      return res.status(409).json({
        success: false,
        message: `A record with this ${target} already exists`
      });
    }
    if (error.code === "P2025") {
      return res.status(404).json({ success: false, message: "Record not found" });
    }
  }

  if (error instanceof SyntaxError && "body" in error) {
    return res.status(400).json({ success: false, message: "Malformed JSON body" });
  }

  const message = error instanceof Error ? error.message : "Internal server error";
  logger.error(
    {
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
      method: req.method,
      path: req.originalUrl
    },
    "Unhandled request error"
  );

  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === "production" ? "Internal server error" : message
  });
}
