import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { AuthenticatedUser } from "../types/authenticated-user";

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/** The authenticated user attached by JwtAuthGuard. Only valid behind that guard. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthenticatedUser => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.user) {
    throw new Error("CurrentUser used on a route with no authenticated user — is JwtAuthGuard applied?");
  }
  return request.user;
});
