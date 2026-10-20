# SPEC_V0.8.4 — "Lessons"

**Status:** DRAFT for approval. No code until §6 build order is approved.
**Depends on:** v0.8 (calendar/timetable — provides `teacherTeachesClassOnDate`,
`isSchoolDayForClassOnDate`, teaching-weekdays), v0.8.2/v0.8.3 (homework — provides the
`StorageService` abstraction, the signed-URL upload + 20MB cap + tenant-isolation guard,
the session-end retention sweep, and the attach-in-form / grouped-by-date UI patterns).
**Theme (one):** teachers post **lessons** — read-only teaching content (a *cahier de
textes*) — for classes they teach; students and parents read them and download their
files; everything is purged at session-end.

**Three school-specific decisions locked (Dami):**
1. **Lesson date = logged for a taught day** (cahier de textes): a lesson's date is a day
   the teacher teaches that class, **today or in the past** (you log what you covered),
   never the future. Listed newest-first by lesson date.
2. **Student side = read-only:** students and parents **read + download attachments**. NO
   mark-done, NO submissions, NO per-student state at all. (This is the core thing that
   makes a Lesson different from Homework.)
3. **Attachments = yes,** reusing the homework storage layer (Firebase `StorageService`,
   20MB cap, session-end purge, tenant-isolation guard).

**Heavy reuse, few new concepts.** Lessons ≈ Homework minus the assignment mechanics
(no due-date-as-deadline, no `HomeworkCompletion`, no `HomeworkSubmission`, no roster/
submissions view), with the date rule inverted (past/today, not future) and retention
extended to purge the whole lesson (rows + files), not just files.

**No grade-engine contact.** New domain. Multi-tenant + own-class/own-child walls apply
as everywhere.

---

## 1. What a Lesson is (and isn't)

A **Lesson** is a record of teaching content a teacher posts for a class+subject they
teach, dated to the day it was taught. It carries a title, a body/description, and
optional file attachments (notes, slides, PDFs). Students and parents of that class can
read published lessons and download the files. That's it — it is **reference material**,
not an assignment:

- NO due date / deadline. The "date" is *when it was taught*, past or today.
- NO mark-done, NO "I've read this", NO student uploads/submissions.
- NO teacher roster/"who did it" view (there's no per-student state to show).

Everything else mirrors homework: per-lesson publish (DRAFT→PUBLISHED), teacher-owned
authoring (current-assignment), attach files in the create form, grouped-by-date reading,
relative dates, delete, session-end purge.

---

## 2. Data model (new — just two tables)

- **Lesson**: `{ schoolId, classArmId, subjectId, teacherUserId, sessionId, title,
  body (text), lessonDate (YYYY-MM-DD), status (DRAFT | PUBLISHED), publishedAt,
  createdAt, updatedAt, deletedAt (soft) }`. Dedicated `LessonStatus` enum (NOT reusing
  homework's/grades' enums — new module, separate domain).
- **LessonAttachment**: `{ lessonId, storageKey, fileName, contentType, sizeBytes,
  schoolId }`. The 20MB cap is across a lesson's attachments (same shape as
  `HomeworkAttachment`).

No completion table, no submission table — the read-only decision means zero per-student
state.

**Flag (plan time):** `body` length cap — recommend 5000 (same as homework description,
which also has a view-more modal). Confirm whether lessons get a "view more" modal for
long bodies (recommend yes — a lesson body can be long).

---

## 3. The lesson-date rule (the one real inversion of homework)

A valid `lessonDate` = ALL of:
1. **Not in the future** — `lessonDate <= today` (you log what was taught; a lesson for a
   day that hasn't happened makes no sense). *(Homework's due-date was the opposite:
   future-or-today.)*
2. **A school day for that class** — not a holiday, not Sunday, not a Saturday when the
   class has `includesSaturday: false`. Reuses `isSchoolDayForClassOnDate` (as homework
   does).
3. **A weekday the teacher teaches that class** — reuses `teacherTeachesClassOnDate`
   (day-level, any period), the exact method homework's due-date rule uses.
4. **Within the current session** — implied by the teaching-weekday/session scoping
   (`teacherTeachesClassOnDate` resolves the current session); a lessonDate before the
   session start has no teaching slot anyway.

The **picker** disables: future dates (`maxDate = today`), non-teaching weekdays (the
teaching-weekdays disable fn), and — the backend 400 is the holiday backstop (holidays are
date-specific, not weekday-specific; same picker/backend division homework settled on).
The **backend** validates all four as a backstop. Combined 400 message: "The lesson date
must be a school day you teach this class, on or before today."

**Reuse, confirmed:** this is `teacherTeachesClassOnDate` + `isSchoolDayForClassOnDate`
applied to `lessonDate` with `maxDate=today` instead of homework's `minDate=today`. One
genuine new line of logic (the not-future check); everything else is the proven homework
machinery pointed at a past-bound date.

---

## 4. Views

### 4.1 Teacher (authoring)
- Create/edit/publish/unpublish/delete lessons for a class+subject they teach
  (`assertTeacherAssignment`, current-assignment authority — same as homework). Per-lesson
  publish. Edit freely while DRAFT; published-edit needs care (mirror homework's shape).
  Delete: teacher-own + SCHOOL_ADMIN/PROPRIETOR safety valve (mirror homework's delete).
- Attach files **in the create form** (reuse the homework attach-in-form flow, the
  create-then-attach-on-submit ordering, the partial-failure handling).
- A teacher's lessons list for the class, grouped by lessonDate (newest first). NO
  submissions/roster view (nothing to show — read-only).

### 4.2 Student + parent (read-only)
- Published lessons for the student's own class (term/session-scoped), grouped by
  **lessonDate, newest first** (cahier de textes). Each lesson: title, subject, body (with
  a "view more" modal for long text), lesson date (relative — Today/Yesterday-else-date),
  and its attachments as **download** links.
- NO mark-done, NO upload — read + download only.
- Parent: per linked child (child-switcher), reusing `assertChildBelongsToCaller`; same
  read-only view.
- Walls reused exactly: student class server-resolved from enrollment (no param), parent
  via `assertChildBelongsToCaller` first, only PUBLISHED, own class/children, 404-not-403.

### 4.3 Attachment download
- Student/parent download a lesson's attachment via a signed download-url, gated by the
  own-class/own-child + PUBLISHED wall (mirror the homework attachment-download matrix).
  Teacher can download their own lesson's attachments too.

---

## 5. Storage + retention

- **Attachments** reuse `StorageService` (Firebase now, R2 later — config swap), the
  signed-URL direct-to-storage upload with the `X-Goog-Content-Length-Range` cap baked
  into the signature, the two-checkpoint 20MB cap, and the **tenant-isolation guard**
  (commit validates the storageKey prefix matches the caller's own
  `schools/{schoolId}/lessons/{lessonId}/...`). `FakeStorageService` in CI — no live
  Firebase in tests.
- **Retention — the whole lesson is purged at session-end** (Dami: "deleted at
  session-end"). At session rollover (the `SessionsService.activate()` isCurrent-flip
  where homework's sweep already lives), lessons belonging to a now-past session have
  their attachment **files deleted from storage AND their rows removed** (lesson +
  attachments). This is slightly stronger than homework (which keeps the homework record):
  lessons are session-scoped content with no grade value to preserve, so the whole thing
  goes. The sweep never throws (try/catch per deleteObject, rows removed regardless —
  same posture as the homework sweep).

**Flag (plan time):** extend the existing homework retention sweep in
`SessionsService.activate()` to also purge lessons (one hook, two domains), vs a sibling
sweep. Recommend extending the same hook (one session-rollover cleanup path). Confirm.

---

## 6. Build order (numbered — each = one Claude Code session: plan → approve → build →
PROVE → commit → push → chat reviews the diff)

*Backend first, then the FRONTEND explicitly scheduled as its own steps — the lesson from
homework, where the spec's build order forgot the frontend and the walk caught an empty
sidebar. Restart the API via `pnpm run start:dev` (not `node dist`) before building.*

1. **Lesson model + teacher authoring + the lesson-date rule (backend, text-only).** The
   `Lesson` model + `LessonStatus` enum + additive migration; create/edit/publish/
   unpublish/delete (teacher current-assignment + admin-valve delete); the lesson-date
   validation (reuse `teacherTeachesClassOnDate` + `isSchoolDayForClassOnDate`, +
   not-future). NO files yet. e2e: create on a taught past/today day OK; future date 400;
   non-teaching-weekday 400; holiday 400; a day they don't teach 400; publish/unpublish;
   edit-frozen-once-published shape; delete scoping (teacher-own + admin valve); tenant
   404; a reassigned teacher inherits authority.
2. **Student + parent read endpoints + the teaching-weekdays endpoint (backend).** The
   read views (own-class/own-child walls, PUBLISHED-only, grouped newest-first by
   lessonDate); the download-url routes (student/teacher/parent-attachment, gated). A
   `GET /lessons/teaching-weekdays` for the picker — flag: reuse the calendar method
   `teacherTeachingWeekdaysForClass` (recommend a thin lessons endpoint mirroring
   homework's, not reimplementing). NO files yet (download-url routes stubbed against the
   model, exercised fully in Step 3). e2e: student sees only own-class PUBLISHED grouped
   newest-first; DRAFT invisible; another class/non-linked child unreachable; parent per
   child.
3. **Attachments + session-end retention (backend, storage reuse).** Teacher attach
   (signed-URL, 20MB cap, tenant-isolation guard, keys under
   `schools/{schoolId}/lessons/{lessonId}/`); the attachment download-url wired to real
   storage; the retention sweep extended to purge lessons (rows + files) at session
   rollover. `FakeStorageService` in CI. e2e: attach within cap; over-cap 409; mismatched-
   prefix key 400; student downloads a published lesson's attachment; the sweep deletes a
   past session's lessons + files but leaves the current session's intact.
4. **Teacher frontend.** Sidebar "Lessons" entry (teacher); a Lessons page per class+
   subject (list grouped newest-first); the create/edit form with attach-in-form (reuse
   the homework form patterns — StyledDatePicker with the teaching-weekday disable +
   maxDate=today, create-then-attach-on-submit, delete). Web tests: create form (date 400
   surfaced, future disabled), publish/unpublish, attach flow (mocked storage), delete.
5. **Student + parent frontend.** Sidebar "Lessons" entry (student/parent); the cahier-de-
   textes read view (grouped newest-first, relative dates, view-more modal, attachment
   download), parent per-child. Web tests: grouped render, download, parent read-only (no
   mark-done/upload controls exist at all), empty state.
6. **Walk + tag v0.8.4.** Teacher posts a lesson (past/today teaching day — future/
   non-teaching disabled), attaches a file, publishes; student + parent read it and
   download; walls hold; (optionally) confirm the session-end purge behaves. Then tag.

---

## 7. What this does NOT touch / does NOT have
- No grade engine, no homework tables, no calendar-resolution change (reuses the calendar's
  existing methods read-only).
- No mark-done, no submissions, no completion/roster — the read-only decision removes an
  entire half of what homework needed.
- The homework feature is untouched; Lessons is a parallel new module (like CalendarModule
  / HomeworkModule were).

---

## 8. Flags consolidated (plan-time, recommendations inline)
- §2: `body` cap 5000 + view-more modal (recommend yes).
- §5: extend the existing homework retention sweep hook to also purge lessons (recommend
  one hook) + confirm lessons are purged WHOLE (rows + files), unlike homework's files-only.
- §6 Step 2: `GET /lessons/teaching-weekdays` as a thin endpoint over the existing
  `teacherTeachingWeekdaysForClass` (recommend; don't reimplement).
- Possible post-tag: a "Your lessons" student-dashboard preview panel (mirror the homework
  one) — NOT in this version unless you want it; flag for later.

No grade engine, walls reused, storage + retention + date machinery reused. One theme:
lessons. Then walk, then tag v0.8.4.
