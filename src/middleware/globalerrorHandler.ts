import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";
import { getErrorCode } from "../utils/appError";

export const globalErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (process.env.NODE_ENV === "development") {
    logger(err.stack);
  }
  const statusCode = err.statusCode || 500;
  const code = getErrorCode(err);
  const errorMessage = err.message || "Something went wrong";

  res.status(statusCode).json({
    error: errorMessage,
    code,
  });
};
