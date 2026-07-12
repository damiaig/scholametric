import { Inject, Injectable, Scope } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import type { Request } from "express";
import type { AuthenticatedUser } from "../types/authenticated-user";

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/**
 * Request-scoped source of truth for the current tenant. Every
 * domain module in step 3+ must go through this instead of reading
 * school_id from the body/query/params (CLAUDE.md §4).
 */
@Injectable({ scope: Scope.REQUEST })
export class TenantContext {
  constructor(@Inject(REQUEST) private readonly request: AuthenticatedRequest) {}

  get schoolId(): string {
    const schoolId = this.request.user?.schoolId;
    if (!schoolId) {
      throw new Error(
        "TenantContext accessed with no authenticated schoolId — is JwtAuthGuard applied to this route?",
      );
    }
    return schoolId;
  }
}
