import { SetMetadata } from "@nestjs/common";

export const AUDIT_KEY = "audit";

export interface AuditMetadata {
  entityType: string;
  action: string;
}

/**
 * Marks a mutation handler for automatic audit_logs writes (SPEC_V0.1.md §1).
 * AuditInterceptor no-ops on any route without this — auth and schools/CRUD
 * are deliberately left undecorated (see docs/DECISIONS.md).
 */
export const Audit = (entityType: string, action: string) =>
  SetMetadata(AUDIT_KEY, { entityType, action } satisfies AuditMetadata);
