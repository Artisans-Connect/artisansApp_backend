import { Router, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { authMiddleware } from "../middleware/auth";
import { idempotencyMiddleware } from "../middleware/idempotency";
import * as paymentsService from "../services/paymentsService";
import * as settlementService from "../services/settlementService";
import * as negotiationEngine from "../services/negotiationEngine";
import { supabaseAdmin } from "../config/supabase";
import { appError } from "../utils/appError";
import { logger } from "../utils/logger";

const router = Router();

// Middleware to verify Paystack Webhook signature
function verifyPaystackSignature(req: Request, res: Response, next: NextFunction) {
  const signature = req.headers["x-paystack-signature"] as string;
  if (!signature) {
    next(appError(401, "Missing Paystack signature header", "UNAUTHORIZED"));
    return;
  }

  const secret = process.env.PAYSTACK_SECRET_KEY || "";
  const hash = crypto
    .createHmac("sha512", secret)
    .update(JSON.stringify(req.body))
    .digest("hex");

  if (hash !== signature) {
    logger("Paystack webhook signature mismatch!");
    next(appError(400, "Invalid webhook signature", "BAD_REQUEST"));
    return;
  }
  next();
}

/**
 * POST /api/payments/initialize
 * Body: { jobId: string, applicationId?: string }
 */
router.post("/initialize", authMiddleware, idempotencyMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobId, applicationId } = req.body;
    if (!jobId) {
      next(appError(400, "jobId is required", "VALIDATION_ERROR"));
      return;
    }

    const result = await paymentsService.initializePayment(req.user!.id, jobId, applicationId);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/payments/verify/:reference
 */
router.get("/verify/:reference", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reference = req.params.reference as string;
    if (!reference) {
      next(appError(400, "Transaction reference is required", "VALIDATION_ERROR"));
      return;
    }

    const result = await paymentsService.verifyPayment(reference);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/payments/callback
 * Redirect landing page after Paystack Checkout.
 */
router.get("/callback", async (req: Request, res: Response) => {
  const reference = req.query.reference as string;
  
  if (reference) {
    try {
      await paymentsService.verifyPayment(reference);
    } catch (err) {
      logger(`Callback verification failed for reference ${reference}:`, err);
    }
  }

  // Render a premium success landing page that instructs user to return to app
  res.status(200).send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payment Successful</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          background-color: #f7f9fc;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          margin: 0;
        }
        .card {
          background-color: #ffffff;
          padding: 40px;
          border-radius: 20px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.05);
          text-align: center;
          max-width: 400px;
          width: 100%;
        }
        .icon {
          font-size: 60px;
          color: #2ec4b6;
          margin-bottom: 20px;
        }
        h1 {
          color: #0f172a;
          font-size: 24px;
          margin-bottom: 10px;
        }
        p {
          color: #64748b;
          font-size: 16px;
          line-height: 1.5;
          margin-bottom: 30px;
        }
        .btn {
          display: inline-block;
          background-color: #2ec4b6;
          color: white;
          padding: 12px 30px;
          text-decoration: none;
          border-radius: 12px;
          font-weight: bold;
          font-size: 16px;
          transition: background-color 0.2s;
        }
        .btn:hover {
          background-color: #20a396;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="icon">✓</div>
        <h1>Payment Successful!</h1>
        <p>Your deposit has been securely placed in escrow. You can now close this window and return to CraftMatch to view your booking matching status.</p>
        <a href="craftmatch://payment-success?reference=${reference}" class="btn">Return to App</a>
      </div>
    </body>
    </html>
  `);
});

/**
 * POST /api/payments/webhook
 * Public endpoint webhook receiver from Paystack.
 */
router.post("/webhook", async (req: Request, res: Response) => {
  const signature = req.headers["x-paystack-signature"] as string;
  
  if (!signature) {
    res.status(401).send("No signature");
    return;
  }

  // Validate webhook secret
  const secret = process.env.PAYSTACK_SECRET_KEY || "";
  const hash = crypto
    .createHmac("sha512", secret)
    .update(JSON.stringify(req.body))
    .digest("hex");

  if (hash !== signature) {
    logger("Webhook signature check failed!");
    res.status(400).send("Invalid signature");
    return;
  }

  const event = req.body;
  
  if (event.event === "charge.success") {
    const reference = event.data.reference;
    logger(`Paystack Webhook: Received charge.success for ref ${reference}`);
    try {
      await paymentsService.verifyPayment(reference);
    } catch (err) {
      logger(`Webhook verification failed for reference ${reference}:`, err);
    }
  }

  res.status(200).send("Webhook received");
});

/**
 * POST /api/payments/payout-details
 * Setup artisan MoMo payout configurations.
 */
router.post("/payout-details", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { network, accountNumber, accountName } = req.body;
    
    if (!network || !accountNumber || !accountName) {
      next(appError(400, "network, accountNumber, and accountName are required", "VALIDATION_ERROR"));
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("worker_payout_details")
      .upsert({
        id: req.user!.id,
        network,
        account_number: accountNumber,
        account_name: accountName,
        is_verified: true, // Defaulting true in test mode
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw appError(500, error.message, "PAYOUT_DETAILS_SAVE_FAILED");

    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/payments/payout-details
 */
router.get("/payout-details", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("worker_payout_details")
      .select("*")
      .eq("id", req.user!.id)
      .maybeSingle();

    if (error) throw appError(500, error.message, "PAYOUT_DETAILS_FETCH_FAILED");

    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/payments/extra-charge/propose
 * Body: { jobId: string, amount: number, description: string, proposedBy: 'worker' | 'client' }
 */
router.post("/extra-charge/propose", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobId, amount, description, proposedBy } = req.body;
    if (!jobId || !amount || !proposedBy) {
      next(appError(400, "jobId, amount, and proposedBy are required", "VALIDATION_ERROR"));
      return;
    }

    const result = await paymentsService.proposeExtraCharge(req.user!.id, jobId, amount, description, proposedBy);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/payments/extra-charge/accept
 * Body: { extraChargeId: string }
 */
router.post("/extra-charge/accept", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { extraChargeId } = req.body;
    if (!extraChargeId) {
      next(appError(400, "extraChargeId is required", "VALIDATION_ERROR"));
      return;
    }

    const result = await paymentsService.acceptExtraCharge(req.user!.id, extraChargeId);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/payments/extra-charge/initialize
 * Body: { extraChargeId: string }
 */
router.post("/extra-charge/initialize", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { extraChargeId } = req.body;
    if (!extraChargeId) {
      next(appError(400, "extraChargeId is required", "VALIDATION_ERROR"));
      return;
    }

    const result = await paymentsService.initializeExtraChargePayment(req.user!.id, extraChargeId);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/payments/extra-charge/counter
 * Body: { extraChargeId: string, amount: number }
 */
router.post("/extra-charge/counter", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { extraChargeId, amount } = req.body;
    if (!extraChargeId || !amount || Number(amount) <= 0) {
      next(appError(400, "extraChargeId and valid amount are required", "VALIDATION_ERROR"));
      return;
    }

    const result = await paymentsService.counterExtraCharge(req.user!.id, extraChargeId, Number(amount));
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/payments/checkout-session/:id
 */
router.get("/checkout-session/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = await paymentsService.getCheckoutSession(req.params.id as string);
    res.status(200).json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/payments/checkout-session/:id/initialize-paystack
 * Public endpoint — called by the payment gateway page when no valid
 * Paystack authorization_url exists for this checkout session.
 */
router.post("/checkout-session/:id/initialize-paystack", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await paymentsService.initializePaystackForSession(req.params.id as string);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/payments/sandbox/callback
 * Body: { reference: string }
 */
router.post("/sandbox/callback", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reference } = req.body;
    if (!reference) {
      next(appError(400, "reference is required", "VALIDATION_ERROR"));
      return;
    }

    if (process.env.USE_SANDBOX_PAYMENTS !== "true") {
      next(appError(400, "Sandbox payments are not enabled", "BAD_REQUEST"));
      return;
    }

    const result = await paymentsService.verifyPayment(reference);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/payments/settlement/:jobId
 */
router.get("/settlement/:jobId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const calculation = await settlementService.calculateSettlement(req.params.jobId as string);
    res.status(200).json({ success: true, data: calculation });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/payments/settlement/:jobId/checkout
 */
router.post("/settlement/:jobId/checkout", authMiddleware, idempotencyMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const calculation = await settlementService.calculateSettlement(req.params.jobId as string);
    if (calculation.outstanding_balance <= 0) {
      // Direct release without checkout since outstanding balance is 0
      const result = await settlementService.processPayoutAndRelease(req.params.jobId as string);
      res.status(200).json({ success: true, message: "Escrow released successfully", data: result });
      return;
    }

    // Initialize payment for outstanding balance:
    // 1. Create a completion_adjustment negotiation round
    const negotiation = await negotiationEngine.createNegotiation({
      jobId: req.params.jobId as string,
      type: "completion_adjustment",
      initiatorId: req.user!.id,
      initialAmount: calculation.gross_amount,
      description: "Final completion settlement"
    });

    // 2. Initialize checkout session
    const paymentInit = await paymentsService.initializePayment(req.user!.id, req.params.jobId as string);
    res.status(200).json({ success: true, data: paymentInit });
  } catch (err) {
    next(err);
  }
});

export default router;

