import { Router } from "express";
import profilesRouter from "./profiles";
import categoriesRouter from "./categories";
import jobsRouter from "./jobs";
import workersRouter from "./workers";
import reviewsRouter from "./reviews";
import chatRouter from "./chat";
import pricingRouter from "./pricing";
import verificationRouter from "./verification";
import notificationsRouter from "./notifications";
import adminRouter from "./admin";
import searchRouter from "./search";
import tradesRouter from "./trades";
import releasesRouter from "./releases";
import paymentsRouter from "./payments";
import reportsRouter from "./reports";
import publicReportsRouter from "./publicReports";
import negotiationsRouter from "./negotiations";
import walletRouter from "./wallet";
import disputesRouter from "./disputes";
import payoutsRouter from "./payouts";

const router = Router();

// Mount modules
router.use("/profiles", profilesRouter);
router.use("/categories", categoriesRouter);
router.use("/jobs", jobsRouter);
router.use("/workers", workersRouter);
router.use("/reviews", reviewsRouter);
router.use("/chat", chatRouter);
router.use("/pricing", pricingRouter);
router.use("/verification", verificationRouter);
router.use("/notifications", notificationsRouter);
router.use("/admin", adminRouter);
router.use("/search", searchRouter);
router.use("/trades", tradesRouter);
router.use("/releases", releasesRouter);
router.use("/payments", paymentsRouter);
router.use("/reports", reportsRouter);
// Public (unauthenticated) abuse-report intake for the Support Hub web form.
// Mounted as its own router so the authenticated /reports routes keep their
// blanket authMiddleware untouched.
router.use("/public/reports", publicReportsRouter);
router.use("/negotiations", negotiationsRouter);
router.use("/wallet", walletRouter);
router.use("/disputes", disputesRouter);
router.use("/payouts", payoutsRouter);

export default router;
