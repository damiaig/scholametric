export type PortalAccountRole = "STUDENT" | "PARENT";

export interface PortalAccountSummary {
  id: string;
  role: PortalAccountRole;
  username: string;
  displayName: string;
  studentId: string | null;
  guardianId: string | null;
  mustChangePassword: boolean;
  createdAt: string;
}

// Plaintext is present ONLY in the response that just (re)generated it —
// never stored, never re-fetchable afterward (SPEC_V0.6.md §5 step 5).
export interface ReissuedPortalAccount extends PortalAccountSummary {
  tempPassword: string;
}

export type SkippedReissueReason = "already_changed_password" | "not_provisioned";

export interface SkippedReissue {
  id: string;
  username: string | null;
  displayName: string;
  reason: SkippedReissueReason;
}

export interface BatchReissueResult {
  classArmId: string;
  reissued: ReissuedPortalAccount[];
  skipped: SkippedReissue[];
}

export interface ProvisionedAccount {
  id: string;
  username: string;
  tempPassword: string;
  studentId?: string;
  guardianId?: string;
}

export type ProvisionWarningType = "no_guardian" | "no_primary_guardian_marked" | "child_not_covered";

export interface ProvisionWarning {
  type: ProvisionWarningType;
  studentId?: string;
  guardianId?: string;
  familyCode?: string;
  message: string;
}

export interface ProvisionResult {
  studentsCreated: ProvisionedAccount[];
  parentsCreated: ProvisionedAccount[];
  alreadyProvisioned: { students: number; parents: number };
  warnings: ProvisionWarning[];
}
