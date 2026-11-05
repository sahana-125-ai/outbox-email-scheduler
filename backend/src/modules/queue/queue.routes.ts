import { Router } from "express";
import { requireAuth } from "../../middlewares/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { getQueueSnapshot } from "../../queue/emailQueue";

const router = Router();

router.get(
  "/",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const snapshot = await getQueueSnapshot();
    res.json({ success: true, data: snapshot });
  })
);

export default router;
