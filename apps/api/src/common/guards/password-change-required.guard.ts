import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request, Response } from "express";
import { ALLOW_WHILE_PASSWORD_CHANGE_REQUIRED_KEY } from "../decorators/allow-while-password-change-required.decorator";
import type { AuthenticatedUser } from "../types/authenticated-user";

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/**
 * Global guard (SPEC_V0.3.md §2), registered right after JwtAuthGuard so
 * request.user is already populated. Reads mustChangePassword straight off
 * that (JWT-claim-sourced) object — no DB hit, see docs/DECISIONS.md for
 * why that's an accepted staleness tradeoff, same as JwtAuthGuard's own
 * disabled/deleted-user check.
 *
 * `request.user` being undefined means the route is @Public() (login,
 * refresh, health) — JwtAuthGuard already let it through without touching
 * request.user, so this guard has nothing to check and gets out of the way.
 */
@Injectable()
export class PasswordChangeRequiredGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user || !request.user.mustChangePassword) {
      return true;
    }

    const isAllowed = this.reflector.getAllAndOverride<boolean>(ALLOW_WHILE_PASSWORD_CHANGE_REQUIRED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isAllowed) {
      return true;
    }

    const response = context.switchToHttp().getResponse<Response>();
    response.setHeader("X-Password-Change-Required", "true");
    throw new ForbiddenException("You must change your password before continuing.");
  }
}
