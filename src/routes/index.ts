import { Router } from "express";
import jobsRouter from "./jobs";
import workersRouter from "./workers";
import chatRouter from "./chat";

const router = Router();

// Mount modules
router.use("/jobs", jobsRouter);
router.use("/workers", workersRouter);
router.use("/conversations", chatRouter);

export default router;
