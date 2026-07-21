import { SetMetadata } from "@nestjs/common";

export const ALLOW_WHILE_PASSWORD_CHANGE_REQUIRED_KEY = "allowWhilePasswordChangeRequired";

/**
 * Exempts this handler from PasswordChangeRequiredGuard (SPEC_V0.3.md §2) —
 * applied to POST /auth/change-password, GET /auth/me, and POST /auth/logout
 * only. Mirrors @Public()'s SetMetadata/Reflector pattern exactly.
 */
export const AllowWhilePasswordChangeRequired = () => SetMetadata(ALLOW_WHILE_PASSWORD_CHANGE_REQUIRED_KEY, true);
