import crypto from "crypto";
import { type Request, type Response, type NextFunction } from "express";
import { supabaseAdmin } from "../config/supabase";

export async function idempotencyMiddleware(req: Request, res: Response, next: NextFunction) {
  const key = req.get("Idempotency-Key");
  if (!key) {
    next();
    return;
  }

  const hash = crypto.createHash("sha256").update(key).digest("hex");

  try {
    const { data } = await supabaseAdmin
      .from("payment_idempotency_keys")
      .select("response_payload")
      .eq("key_hash", hash)
      .maybeSingle();

    if (data) {
      res.status(200).json(data.response_payload);
      return;
    }

    (req as any).idempotencyKeyHash = hash;
    
    const originalJson = res.json;
    res.json = function (body: any) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        (async () => {
          try {
            await supabaseAdmin
              .from("payment_idempotency_keys")
              .insert({
                key_hash: hash,
                response_payload: body
              });
          } catch (err: any) {
            console.error("Idempotency save warning:", err.message);
          }
        })();
      }
      return originalJson.call(this, body);
    };

    next();
  } catch (err) {
    next(err);
  }
}
