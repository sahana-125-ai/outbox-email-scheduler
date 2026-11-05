import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthRequest } from "../../middlewares/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { paginationMeta } from "../../utils/pagination";
import { reindexUser, searchEmails } from "./search.service";

const router = Router();

const searchQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z
    .enum(["SCHEDULED", "PROCESSING", "SENT", "FAILED", "RATE_LIMITED", "CANCELLED"])
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20)
});

router.get(
  "/emails",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const query = searchQuerySchema.parse(req.query);
    const result = await searchEmails({
      userId: req.userId!,
      q: query.q || undefined,
      status: query.status,
      page: query.page,
      limit: query.limit
    });

    res.json({
      success: true,
      data: result.items,
      meta: {
        ...paginationMeta(
          { page: query.page, limit: query.limit, skip: (query.page - 1) * query.limit },
          result.total
        ),
        engine: result.engine
      }
    });
  })
);

router.post(
  "/reindex",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const count = await reindexUser(req.userId!);
    res.json({
      success: true,
      message: `Indexed ${count} email${count === 1 ? "" : "s"}`,
      data: { count }
    });
  })
);

export default router;
