import rateLimit from "express-rate-limit";

const rateLimitInstance = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many requests, please try again later.",
    code: "RATE_LIMIT_EXCEEDED",
  },
});

export const rateLimiter = (req: any, res: any, next: any) => {
  if (process.env.NODE_ENV !== "production") {
    next();
    return;
  }
  return rateLimitInstance(req, res, next);
};
