import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db';

const communityIdSchema = z.object({
  id: z.string().uuid(),
});

/**
 * DELETE /api/v1/communities/:id
 * Soft-deletes an active community by setting deleted_at.
 */
export async function deleteCommunity(req: Request, res: Response, next: NextFunction): Promise<void> {
  const result = communityIdSchema.safeParse(req.params);
  if (!result.success) {
    res.status(400).json({
      error: 'Validation failed',
      meta: {
        errors: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
    return;
  }

  try {
    const deleted = await db.query<{ id: string }>(
      `UPDATE communities
       SET deleted_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [result.data.id]
    );

    if (!deleted[0]) {
      res.status(404).json({ error: 'Community not found' });
      return;
    }

    res.json({ data: { deleted: true } });
  } catch (err) {
    next(err);
  }
}
