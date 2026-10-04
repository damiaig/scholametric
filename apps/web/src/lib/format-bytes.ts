// v0.8.3 step 3 — extracted from HomeworkFormDialog.tsx (where it was
// first added in step 2) so HomeworkDetailDialog.tsx's new per-submission
// view doesn't need its own duplicate copy.
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}
