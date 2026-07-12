import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { AuthenticatedUser } from "../types/authenticated-user";

/**
 * CLAUDE.md §5: 100 req/min per user globally. JwtAuthGuard runs before this
 * guard (see AppModule provider order) so request.user is already populated
 * for authenticated calls; anonymous calls (login, schools/search) fall back
 * to per-IP tracking.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const request = req as { user?: AuthenticatedUser; ip?: string };
    return request.user?.userId ?? request.ip ?? "unknown";
  }
}
