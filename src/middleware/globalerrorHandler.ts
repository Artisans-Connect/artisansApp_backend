import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";

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
  const code = err.code || (statusCode === 500 ? "INTERNAL_SERVER_ERROR" : "REQUEST_ERROR");
  const errorMessage = err.message || "Something went wrong";

  res.status(statusCode).json({
    error: errorMessage,
    code,
  });
};
