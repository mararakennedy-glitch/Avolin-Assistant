import { Router, type IRouter } from "express";
import healthRouter from "./health";
import openaiRouter from "./openai/conversations";
import paymentsRouter from "./payments";
import meRouter from "./me";

const router: IRouter = Router();

router.use(healthRouter);
router.use(openaiRouter);
router.use(paymentsRouter);
router.use(meRouter);

export default router;
