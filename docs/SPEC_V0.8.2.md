# SPEC_V0.8.2 — "Homework"

**Status:** DRAFT for approval. No code until §6 build order is approved.
**Depends on:** v0.8 + v0.8.1 (Calendar & Timetable) — tagged. Homework's due dates
consult the calendar's school-day/holiday knowledge; the portal (v0.6) carries the
student/parent views.
**Origin:** The feature the portal and calendar were built toward. Teachers set homework;
students see it (Pronote-style, grouped by due date), mark it done, and upload documents;
parents see it per child. This is the first feature to introduce FILE STORAGE (attachments
+ student uploads) — Firebase Storage, behind a thin abstraction so it can swap to
Cloudflare R2 later without a rewrite.

**A new domain — does NOT touch the grade engine.** New models, new endpoints, new UI,
new storage infrastructure. The multi-tenant + own-child/own-class walls apply exactly as
everywhere. Homework is a SEPARATE page — it does NOT display on the calendar/timetable
(Dami's call).

**Frozen scope — the items below, nothing added after this:**
1. Teacher sets homework: title, description (with a "view more" modal for long text),
   **due date**, per class+subject. Per-homework publish (each homework published on its
   own).
2. **Text + file attachments** (teacher's files): total cap **20 MB per homework**; past
   the cap, the UI recommends a Google Drive link or zipping/compressing. Size cap
   enforced SERVER-SIDE.
3. Teacher can **require** students to upload a document for a given homework.
4. Student **marks "done"** (a checkbox — NOT ticking ≠ not done, it's a signal) and can
   **upload documents** (NOT uploading ≠ not done). All student uploads are **visible to
   the teacher**.
5. **Students, teachers, AND parents** see homework (parent per child, child-switcher).
6. **Pronote-style display, grouped by DUE DATE** (like the reference: "Pour lundi 28
   sept" → each homework with subject, description, Non Fait/Fait status, "J'ai terminé"
   checkbox).
7. **Due dates respect the calendar's school-days** (so "due next school day" is sane —
   consults the v0.8 calendar's holiday/school-day resolution).
8. **Past-due homework is hidden from STUDENTS** once its due day passes; the TEACHER
   keeps the record (completion + uploads remain visible to the teacher after the due
   date).
9. **File storage:** Firebase Storage, behind a thin storage abstraction (swap to
   Cloudflare R2 later = config change, not rewrite). Server-side size caps as cost
   protection.
10. **File retention:** homework files kept through the SESSION (full school year),
    purged at session-end. Grades are never purged (unaffected).

Anything new at the walk → post-tag list, not this cycle.

---

## 1. Theme

One theme: **homework, Pronote-style** — teachers set it with due dates and attachments,
students see a clean due-date-grouped list and mark it done / upload their work, parents
follow along per child. Introduces the file-storage foundation (Firebase behind an
abstraction) that later features (resources, etc.) reuse.

**Independent of the grade engine.** New domain. The security walls (own-child/own-class,
tenant scoping) apply as everywhere. Homework is its own page, NOT on the calendar.

---

## 2. Data model (new)

Indicative — finalized at the relevant step's plan:
- **Homework**: `{ schoolId, classArmId, subjectId, teacherUserId, sessionId/termId,
  title, description, dueDate, requiresUpload: boolean, status (DRAFT | PUBLISHED),
  publishedAt, createdAt }`. Per-homework publish.
- **HomeworkAttachment** (teacher's files): `{ homeworkId, storageKey, fileName,
  contentType, sizeBytes }`. The 20 MB cap is across a homework's attachments.
- **HomeworkCompletion** (student mark-done): `{ homeworkId, studentId, markedDone:
  boolean, markedAt }`. "Not ticked" is simply the absence/false — never inferred as
  "not done" beyond the tick itself.
- **HomeworkSubmission** (student uploads): `{ homeworkId, studentId, storageKey,
  fileName, contentType, sizeBytes, uploadedAt }`. Visible to the teacher.

**Flag (plan time):** dueDate as a plain date (YYYY-MM-DD) — reuse the calendar's date
conventions. The "respects school-days" (§Item 7) is about VALIDATION/UX when SETTING a
due date (can't be a holiday/non-school-day; "next school day" helper), not about storage.

---

## 3. Teacher: create + publish + attachments + see submissions

- Teacher creates homework for a class+subject they teach (reuse assertTeacherAssignment —
  the canonical "who teaches what" gate, as grades/timetable do). Title, description, due
  date, requiresUpload flag.
- **Due date validation (Item 7):** must be a school day for that class (not a holiday,
  not a non-school-day; Sunday impossible). Reuse the v0.8 calendar's
  isSchoolDayForClass. A "next school day" default/helper.
- **Per-homework publish (Item 1):** DRAFT until the teacher publishes it; only PUBLISHED
  homework is visible to students/parents. (Mirrors the per-evaluation publish model from
  v0.7.4 — teacher owns it, no admin approval.)
- **Attachments (Item 2):** teacher attaches files; total ≤ 20 MB per homework, enforced
  SERVER-SIDE (reject over-cap). Over the cap → UI recommends a Drive link / zip. (A Drive
  link is just part of the description text — no special handling.)
- **Seeing submissions (Item 4):** the teacher sees, per homework, which students marked
  done and which uploaded, and can open the uploads.

## 4. Student + parent views (Pronote-style, Item 6)

- **Grouped by due date** ("Pour [day]") — each homework shows subject, description
  (with "view more" modal for long text, Item 1), a Non Fait/Fait status, and the "J'ai
  terminé" (mark-done) checkbox.
- **Mark done (Item 4):** ticking sets HomeworkCompletion.markedDone = true → badge flips
  to Fait. Un-ticking is allowed. Not ticking is NOT "not done" — it's just un-marked.
- **Upload (Item 4):** where requiresUpload (or optionally always), the student can upload
  a document. Not uploading is NOT "not done".
- **Past-due hidden from students (Item 8):** a homework whose dueDate is past no longer
  appears in the student's/parent's list. (The teacher still sees it + its completions/
  uploads.) Reuse the same "is this date past" comparison shape v0.8.1 established
  (isPeriodTimePast's sibling — a date-past check).
- **Parent:** per child (child-switcher), only their linked children — reuse
  assertChildBelongsToCaller (the exact own-child wall).

## 5. File storage (Item 9) — Firebase behind an abstraction

- **Storage abstraction:** all file operations (upload, get-signed-url, delete) go through
  ONE interface (e.g. StorageService) with a Firebase implementation now. Swapping to
  Cloudflare R2 later = a new implementation + config, NOT a rewrite of the homework code.
- **Firebase Storage** as the initial backend. Dami sets up the Firebase project + service
  credentials at the storage step (exact instructions provided then).
- **Server-side size caps** (Item 2) as cost protection — a bug/abuse can't run up a bill
  (Firebase has no spending cap; the cap is our guard).
- **Uploads:** the flow (direct-to-storage via signed URL vs. through-the-API) decided at
  the storage-step plan — recommend signed-URL direct upload (keeps large files off the
  API server), with the API recording the metadata row + enforcing the cap.
- **Retention (Item 10):** homework files (attachments + submissions) kept through the
  SESSION, purged at session-end. A cleanup on session rollover (or a marked-for-deletion
  sweep). Grades untouched.

**Flag (plan time):** the exact upload flow (signed-URL vs. API-proxied) and how the
server-side cap is enforced with a direct upload (recommend: the API issues the signed URL
only after checking the declared size against the remaining 20 MB budget, then verifies
actual size on the metadata-commit).

---

## 6. Build order (numbered — each = one Claude Code session: plan → approve → build →
PROVE → commit → push → chat reviews the diff)

*Non-file steps first (build + prove the feature), then the storage foundation, then files
on top. Firebase setup happens right before Step 3.*

1. **Homework model + teacher create/publish (text only) + due-date-respects-school-days.**
   The Homework model, teacher create (title/description/dueDate/requiresUpload),
   per-homework publish, due-date validation against the calendar's school-days. NO files
   yet. e2e: create, publish, due-date rejects a holiday/non-school-day, teacher-scoping.
2. **Student + parent views (Pronote due-date-grouped) + mark-done + past-due-hidden.**
   The grouped-by-due-date display, mark-done (completion), the view-more modal, past-due
   hidden from students (teacher keeps the record), parent per-child. NO uploads yet.
   e2e: student sees published homework grouped by due date; marking done flips status;
   past-due hidden from student but visible to teacher; own-child wall.
3. **Storage foundation: the abstraction + Firebase + size caps.** The StorageService
   interface + Firebase implementation, signed-URL upload flow, server-side 20 MB cap,
   the retention/session-purge mechanism. (Dami sets up Firebase here — instructions
   provided.) e2e/integration: upload within cap works, over-cap rejected, retention
   marks correctly.
4. **Attachments + student uploads on homework.** Teacher attaches files (≤20 MB,
   Drive-link recommendation past cap); student uploads (where required/allowed); teacher
   sees all student uploads. Built on Step 3's storage. e2e: attach, over-cap rejected,
   student upload visible to teacher, required-upload enforced where set.
5. **Acceptance walk + tag v0.8.2.** Teacher sets homework with an attachment + due date;
   student sees it grouped by day, marks done, uploads; parent sees per child; teacher
   sees submissions; past-due drops off the student view; walls hold. Then tag.

---

## 7. How to start
Resolve the flagged questions at each step's plan. Storage choice: Firebase to start
(behind the abstraction so R2 is a later swap). Steps 1-2 are file-free — we build and
prove the homework feature before touching storage; Firebase setup happens right before
Step 3, with exact instructions. This is a new domain — the grade engine, publish model,
and their walls are untouched; the own-child/own-class + tenant walls apply as everywhere.
Hold the freeze: the scope above, then tag. New discoveries → post-tag list.
