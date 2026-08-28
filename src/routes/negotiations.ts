import { Router, type Request, type Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { catchAsync } from "../utils/catchAsync";
import * as negotiationEngine from "../services/negotiationEngine";
import { paramId } from "../utils/routeParams";

const router = Router();

// Create a new negotiation
router.post(
  "/",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const { jobId, applicationId, type, initialAmount, description } = req.body;
    const idempotencyKey = req.get("Idempotency-Key");

    if (!jobId || !type || initialAmount === undefined) {
      res.status(400).json({ success: false, error: "jobId, type, and initialAmount are required" });
      return;
    }

    const negotiation = await negotiationEngine.createNegotiation({
      jobId,
      applicationId,
      type,
      initiatorId: req.user!.id,
      initialAmount: Number(initialAmount),
      description,
      idempotencyKey
    });

    res.status(201).json({ success: true, data: negotiation });
  })
);

// Get all active negotiations for a job
router.get(
  "/job/:jobId",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const jobId = paramId(req.params.jobId);
    const negotiations = await negotiationEngine.getActiveNegotiationsForJob(jobId, req.user!.id);
    res.status(200).json({ success: true, data: negotiations });
  })
);

// Get negotiation by ID
router.get(
  "/:id",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const id = paramId(req.params.id);
    const negotiation = await negotiationEngine.getNegotiationState(id, req.user!.id);
    res.status(200).json({ success: true, data: negotiation });
  })
);

// Propose a counter-offer
router.post(
  "/:id/propose",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const id = paramId(req.params.id);
    const { amount, note } = req.body;

    if (amount === undefined) {
      res.status(400).json({ success: false, error: "amount is required" });
      return;
    }

    const negotiation = await negotiationEngine.proposeAmount(
      id,
      req.user!.id,
      Number(amount),
      note
    );

    res.status(200).json({ success: true, data: negotiation });
  })
);

// Accept the current proposal
router.post(
  "/:id/accept",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const id = paramId(req.params.id);
    const negotiation = await negotiationEngine.acceptCurrentProposal(id, req.user!.id);
    res.status(200).json({ success: true, data: negotiation });
  })
);

// Reject/cancel the negotiation
router.post(
  "/:id/reject",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const id = paramId(req.params.id);
    const { reason } = req.body;

    const negotiation = await negotiationEngine.rejectNegotiation(id, req.user!.id, reason);
    res.status(200).json({ success: true, data: negotiation });
  })
);

export default router;
