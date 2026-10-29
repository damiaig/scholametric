import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { CSRF_HEADER_NAME } from "../../auth/auth.constants";

/**
 * v0.8.5 step 1 (SPEC_V0.8.5.md §4) — defense-in-depth on top of
 * SameSite=Lax, applied only to the two cookie-reliant auth endpoints
 * (/auth/refresh, /auth/logout — never /auth/login, which needs the
 * actual password and isn't cookie-reliant in the CSRF sense). A forged
 * cross-site request can't attach a custom header without triggering a
 * CORS preflight the API's origin allow-list won't grant, so a missing
 * header here means the request didn't come through this app's own
 * client. Presence-only check — the exact value never matters.
 */
@Injectable()
export class CsrfHeaderGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const header = request.headers[CSRF_HEADER_NAME];
    if (!header || (Array.isArray(header) && header.length === 0)) {
      throw new ForbiddenException("Missing required request header.");
    }
    return true;
  }
}
