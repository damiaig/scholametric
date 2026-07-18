// entityType.action -> a human sentence fragment. Only the student-facing
// actions are wired up to a real UI yet (the student detail History tab),
// but kept keyed by the full action string (matches AuditLogEntry.action
// verbatim) so this stays a drop-in for any future audit view.
const ACTION_LABELS: Record<string, string> = {
  "student.create": "Student created",
  "student.update": "Student updated",
  "student.withdraw": "Student withdrawn",
  "student.transferClass": "Student transferred class",
  "studentGuardian.add": "Guardian added",
  "studentGuardian.remove": "Guardian removed",
  "studentGuardian.setPrimary": "Primary guardian changed",
  "guardian.update": "Guardian details updated",
};

export function humanizeAuditAction(action: string): string {
  return ACTION_LABELS[action] ?? action;
}
