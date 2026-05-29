import { Router } from "express";
import profilesRouter from "./profiles";
import categoriesRouter from "./categories";
import jobsRouter from "./jobs";
import workersRouter from "./workers";
import chatRouter from "./chat";

const router = Router();

// Mount modules
router.use("/profiles", profilesRouter);
router.use("/categories", categoriesRouter);
router.use("/jobs", jobsRouter);
router.use("/workers", workersRouter);
router.use("/conversations", chatRouter);

export default router;
