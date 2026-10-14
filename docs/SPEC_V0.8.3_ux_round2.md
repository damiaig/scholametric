# SPEC — v0.8.3 Homework UX Round 2 (folds into v0.8.3, pre-tag)

**Status:** DRAFT for approval. No code until §build order approved.
**Context:** v0.8.3 steps 1-5 + the Item 4 rework are built and green but NOT tagged. The
Item 4 re-walk surfaced 6 more homework-UX items; folding them into v0.8.3 (rather than a
point release) since it's still untagged. After these: one walk → tag v0.8.3 → v0.8.4
Lessons.

**Mostly frontend; one item has a backend part (file delete).** No grade-engine contact.
The own-class/own-child/tenant walls and the storage abstraction (StorageService) are
reused as-is.

**The 6 items:**
1. **Student dashboard "Coming soon" → live Homework card** (BUG — the card lies; homework
   is live). Wire it to /me/homework.
2. **Surface the student upload cap** — the 20MB-per-student-per-homework cap ALREADY
   exists server-side (v0.8.2 step 4). Show it in the student upload UI (like the teacher's
   "X MB remaining of 20MB"). No new limit — just make the existing one visible.
3. **Delete an uploaded file** (NEW — delete was deliberately skipped in v0.8.2):
   - Student deletes their OWN submission file(s) on a homework (while it's current).
   - Teacher deletes their OWN attachment(s) on a homework they teach.
   Backend: DELETE endpoints + StorageService.deleteObject + free the 20MB budget. Frontend:
   a delete control (with confirm) on each deletable file row.
4. **Teacher can open student files directly** — already works via clicking the student's
   NAME (→ per-submission modal → download). ALSO make the filename in the Submissions
   table/row directly clickable (discoverability). (Flag: confirm name-click worked for
   you, or if it didn't that's a bug to check.)
5. **Teacher homework page styling** — the teacher class page still reads "too dead."
   A styling pass to the app's card/visual language.
6. **Relative due dates** — "Today" / "Tomorrow" / "Yesterday" within ±1 day of the due
   date, otherwise the full date ("Monday 12 October"). Applies to the student Pronote
   view and the teacher list. (Flag: confirm the Today/Tomorrow/Yesterday-else-date rule.)

---

## Build order (each = plan → approve → build → prove → review)

### Step A — Delete files (the one with a backend part)
- **Backend:**
  - `DELETE /me/homework/:id/submissions/:submissionId` (STUDENT, own submission only —
    resolveOwnStudentId + the submission belongs to the caller). Deletes the storage object
    (StorageService.deleteObject) + the row. The 20MB student budget frees naturally
    (budget re-sums from remaining rows).
  - `DELETE /homework/:id/attachments/:attachmentId` (TEACHER via assertTeacherAssignment —
    current-assignment authority, same as everything else). Deletes storage object + row;
    frees the homework's 20MB budget.
  - Flags for the plan: can a student delete after the homework's due date passed? (Past-due
    is hidden from students, so delete is only reachable while current — so effectively no
    special-casing needed, but confirm.) Teacher attachment delete allowed anytime
    (attachments aren't frozen). Tenant/own-X walls on both. e2e: owner deletes OK;
    non-owner/cross-tenant 403/404; storage object actually deleted (FakeStorageService);
    budget frees.
- **Frontend:**
  - Student: a delete (×/trash) control on each of their own submitted-file rows, with a
    confirm (reuse ConfirmDialog). On success, the row disappears and the cap display
    updates.
  - Teacher: a delete control on each attachment row (in the form's attachment list, where
    attachments now live). Confirm + removal.
  - Reuse the existing download/mutation patterns; new delete hooks over the new endpoints.

### Step B — Student cap display + relative due dates + dashboard card (frontend bundle)
- **Item 2:** show "X MB remaining of 20MB for your upload" in the student upload area (the
  teacher side already has this exact UX — mirror it, computed from the student's own
  submissions' sizes against the 20MB cap). Advisory display; server stays authoritative.
- **Item 6:** a `formatDueDateRelative(dueDate, today)` helper → "Today" / "Tomorrow" /
  "Yesterday" within ±1 day, else the existing formatDate ("Monday 12 October"). Apply in
  HomeworkDueDateList (student/parent) and the teacher list. (Reuse/sit beside the existing
  format-date.ts utilities; inject `today` for testability, matching the codebase pattern.)
- **Item 1:** the student dashboard Homework card — replace "Coming soon" with a live card
  linking to /me/homework (match the Grades/Timetable quick-action cards already there).
  Flag: confirm whether it should show a count (e.g. "3 due") or just be a link — recommend
  a plain link first (a count needs a cheap fetch; can add later).

### Step C — Teacher homework page styling + filename-clickable (frontend bundle)
- **Item 5:** styling pass on the teacher homework class page (HomeworkClassPage) — bring it
  to the app's card/spacing/typography language (named, concrete changes against existing
  patterns, presentation-only, behavior tests unchanged — same discipline as v0.8.3 step 3's
  styling pass).
- **Item 4:** in the Submissions view, make the student's submitted filename directly
  clickable (download) in the row, in addition to the name-opens-modal behavior. (If the
  name-click was actually broken, fix that too — confirm at plan.)

### Walk + tag
Re-walk the 6 (dashboard card live; student cap shown; student deletes a file; teacher
deletes an attachment; teacher opens a student file from the row; relative dates;
teacher page looks less dead), confirm the Item-4 rework + other v0.8.3 items still hold,
then tag v0.8.3.

---

## Flags consolidated (plan-time)
- Teacher-open (Item 4): confirm name-click works (then it's just adding row-level click) vs.
  was broken (then also a bug fix).
- Relative dates (Item 6): Today/Tomorrow/Yesterday-else-date — confirm.
- Dashboard card (Item 1): plain link vs. with-count — recommend plain link first.
- Student delete after due date: confirm no special-casing needed (past-due already hidden).
- Reuse: StorageService.deleteObject (exists), ConfirmDialog (exists), the teacher cap-display
  UX (exists) — all reused, nothing new invented beyond the 2 delete endpoints + hooks.

No grade-engine contact. Walls reused. Storage abstraction reused. One walk, then tag v0.8.3.
