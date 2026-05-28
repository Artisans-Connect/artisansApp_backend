import createHttpError from "http-errors";

export function appError(statusCode: number, message: string, code: string) {
  const err = createHttpError(statusCode, message);
  (err as createHttpError.HttpError & { errorCode: string }).errorCode = code;
  return err;
}

export function getErrorCode(err: unknown): string {
  const e = err as { errorCode?: string; code?: string };
  if (e?.errorCode) return e.errorCode;
  if (typeof e?.code === "string" && !e.code.startsWith("E")) return e.code;
  return "INTERNAL_SERVER_ERROR";
}
