import { Router } from "express";
import jobsRouter from "./jobs";
import workersRouter from "./workers";
import reviewsRouter from "./reviews";
import chatRouter from "./chat";

const router = Router();

// Mount modules
router.use("/jobs", jobsRouter);
router.use("/workers", workersRouter);
router.use("/reviews", reviewsRouter);
router.use("/conversations", chatRouter);

export default router;
