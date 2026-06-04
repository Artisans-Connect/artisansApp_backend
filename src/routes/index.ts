import { Router } from "express";
import profilesRouter from "./profiles";
import categoriesRouter from "./categories";
import jobsRouter from "./jobs";
import workersRouter from "./workers";
import reviewsRouter from "./reviews";
import chatRouter from "./chat";
import pricingRouter from "./pricing";

const router = Router();

// Mount modules
router.use("/profiles", profilesRouter);
router.use("/categories", categoriesRouter);
router.use("/jobs", jobsRouter);
router.use("/workers", workersRouter);
router.use("/reviews", reviewsRouter);
router.use("/chat", chatRouter);
router.use("/pricing", pricingRouter);

export default router;
