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
import negotiationsRouter from "./negotiations";

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
router.use("/negotiations", negotiationsRouter);

export default router;
