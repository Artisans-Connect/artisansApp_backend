import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { logger } from "../utils/logger";
import { getErrorCode } from "../utils/appError";

function zodMessage(err: ZodError): string {
  const first = err.issues[0];
  return first?.message ?? "Invalid request";
}

export const globalErrorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  if (process.env.NODE_ENV === "development" && err instanceof Error) {
    logger(err.stack ?? err.message);
  }

  let statusCode = 500;
  let errorMessage = "Something went wrong";
  let code = "INTERNAL_SERVER_ERROR";

  if (err instanceof ZodError) {
    statusCode = 400;
    errorMessage = zodMessage(err);
    code = "VALIDATION_ERROR";
  } else {
    const e = err as { statusCode?: number; message?: string };
    statusCode = e.statusCode && e.statusCode >= 400 ? e.statusCode : 500;
    errorMessage = e.message || errorMessage;
    code = getErrorCode(err);
    if (statusCode === 404 && code === "INTERNAL_SERVER_ERROR") {
      code = "NOT_FOUND";
    }
  }

  res.status(statusCode).json({
    success: false,
    error: errorMessage,
    code,
  });
};
