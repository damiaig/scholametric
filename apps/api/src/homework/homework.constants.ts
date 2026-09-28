// v0.8.2 step 4 (SPEC_V0.8.2.md §6 item 4) — 20MB is the spec's own number
// for teacher attachments (§2). The student-submission cap isn't stated in
// the spec; ruled at plan time to mirror it as the sane symmetric default.
export const HOMEWORK_ATTACHMENT_CAP_BYTES = 20 * 1024 * 1024;
export const HOMEWORK_SUBMISSION_CAP_BYTES = 20 * 1024 * 1024;
