import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

/** Bypasses the global JwtAuthGuard for this handler/controller (CLAUDE.md §5). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
