# SPEC_V0.8.3 — "Homework Refinements + Polish"

**Status:** DRAFT for approval. No code until §6 build order is approved.
**Depends on:** v0.8.2 (Homework) — tagged at `60b4be6`. This refines and polishes the
shipped homework feature, plus two site-wide UX passes (back buttons, styled file input)
that reach beyond homework.
**Origin:** Dami's v0.8.2 acceptance walk (with real Firebase) surfaced a set of UX
refinements once homework was driven by hand: the separate attach dialog is awkward,
labels and styling need work, the submissions view wants a per-student modal, and homework
should respect the teacher's own timetable. Plus two consistency passes the walk made
obvious (back buttons on drill-in pages; a styled file input to replace the raw native
control — which also removes the browser's French "Choisir un fichier").

**Mostly frontend, one backend rule.** Items 1-3, 5-8 are frontend over existing endpoints.
Item 4 (calendar-aware homework days) is a backend validation rule + its frontend surfacing.
No grade-engine contact. The own-class/own-child/tenant walls hold as everywhere.

**Frozen scope — eight items, nothing added after this:**
1. Attachments move INTO the create-homework form (upload alongside title/description/
   due-date, in one flow) — retire the separate attach step for authoring.
2. Relabel "Attachments & submissions" → "Submissions" (the teacher's per-homework view of
   student uploads); teacher attachments live in the form now (Item 1).
3. Conditional student upload: no-upload-required homework → just the done/not-done
   control; requiresUpload homework → the upload control appears.
4. **Calendar-aware homework days (DAY-LEVEL, Dami's ruling):** a teacher can set homework
   for a class only on a day they actually teach that class (any period that day). The
   rule is about the CREATE day, not the due date (due date stays any future school day,
   as it already is).
5. Per-submission view modal: in the teacher's submissions view, each student's submission
   is clickable → opens a modal showing that student's submission(s).
6. Homework page styling — student + teacher pages ("too basic"), brought up to the app's
   card/visual language (match grades/timetable polish).
7. Site-wide back buttons: anywhere you click into something (a drill-in: a class picker →
   class page, etc.), a way back to where you came from.
8. Site-wide styled file-input component: replace raw `<input type="file">` everywhere with
   one styled component — also removes the browser's native "Choisir un fichier" French
   text (an app-controlled label instead).

Anything new at the walk → post-tag list, not this cycle.

---

## 1. Theme

Polish and refine the shipped homework feature into its finished form, plus two site-wide
consistency passes the walk made obvious. No new domain — this makes the existing homework
better and the app's navigation/file-input consistent.

**No grade-engine contact. Walls hold as everywhere.** Item 4 adds one validation rule
reusing the timetable's own "does this teacher teach this class on this day" knowledge; the
rest is presentation.

---

## 2. The eight items

### 2.1 Attachments in the create-homework form (Item 1)
Today a teacher creates homework, then opens a separate "Attachments & submissions" dialog
to attach files. Change: the attach control lives IN the create/edit form, so a teacher
uploads files while writing the title/description/due-date — one flow. The existing
3-step attach orchestration (issue-url → raw PUT → commit) is reused; it just lives in the
form now.

**Flag (plan time):** a homework needs an `id` before a file can be attached to it (the
storage key embeds `homeworkId`, and the attach endpoint is `/homework/:id/attachments`).
So "attach during create, before the homework exists" has an ordering question: either
(a) create the homework (DRAFT) first on form-open or first-file-select, then attach to it;
or (b) hold files client-side and attach them after the create succeeds, before the form
closes. Recommend (b) — create-then-attach-on-submit, so an abandoned form leaves no
orphan DRAFT. Confirm at plan.

### 2.2 Relabel → "Submissions" (Item 2)
With attachments now in the form (Item 1), the old "Attachments & submissions" dialog
becomes just the teacher's view of student SUBMISSIONS. Rename it "Submissions". (Teacher
attachments are shown in the form / on the homework card; student submissions in this view.)

### 2.3 Conditional student upload (Item 3)
Student side: if the homework's `requiresUpload` is false → show only the done/not-done
control (no file input). If `requiresUpload` is true → show the upload control. (The upload
still WORKS when shown; this is about not showing it when no upload is expected — cleaner.)
The data already carries `requiresUpload`; this is a conditional render.

### 2.4 Calendar-aware homework days — day-level (Item 4)
A teacher can create homework for a class only on a day they teach that class. DAY-LEVEL:
they teach the class in ANY period that day → allowed; they teach it in NO period that day
(or it's a break/holiday/non-school-day for them) → rejected. The rule is on the CREATE
day (the day the homework is authored), NOT the due date (due date remains any future
school day, Item-7-of-v0.8.2 rule unchanged).

**Reuse, don't reimplement:** the timetable already knows "does teacher T teach class C
on weekday W" (the resolved schedule / the TimetableSlot data). The validation reuses that
knowledge — a new service check "does this teacher have any slot for this class on today's
weekday" — NOT a reimplementation of schedule resolution. Spell out the exact reuse at plan.

**Flag (plan time):** "today" = the server's current date/weekday at create time. Confirm
the comparison (the teacher's slots for this class on the current weekday, respecting the
calendar's school-day/holiday state for today). And the frontend surfaces the rejection
legibly (a 400 "you can only set homework for this class on a day you teach it").

### 2.5 Per-submission view modal (Item 5)
In the teacher's Submissions view, each student row's submission is clickable → a modal
showing that student's submission(s) (the file(s), download links, marked-done status,
timestamp). Reuses the existing submission download-url endpoint. A read view — no new
backend (the submissions data + download-url already exist from v0.8.2).

### 2.6 Homework page styling (Item 6)
The student and teacher homework pages are "too basic" — bring them to the app's visual
language (cards, spacing, typography, status treatment) matching the grades/timetable
polish. Presentation only — no behavior change. Reuse existing UI primitives
(Card/StatusBadge/etc.).

### 2.7 Site-wide back buttons (Item 7)
Anywhere the app drills in (a list/picker → a detail page: the homework class picker →
class page, the timetable class picker → builder, grades class → class grades, etc.), add
a consistent "back" affordance to return to the previous level. One shared pattern/
component, applied across the drill-in pages.

**Flag (plan time):** audit which pages are drill-ins needing a back control (list them at
plan), and whether this is a shared `<BackLink>`/`<BackButton>` component reused, or
browser-history-based (`navigate(-1)`) vs. explicit parent-route links. Recommend an
explicit back-to-parent link (predictable destination) over `navigate(-1)` (which depends
on history and can misbehave). Confirm the list + the approach at plan.

### 2.8 Site-wide styled file input (Item 8)
Replace every raw `<input type="file">` with one styled file-input component (app-styled
button + chosen-file display). This also removes the browser's native French "Choisir un
fichier / Aucun fichier choisi" text (the OS-locale control), replacing it with an
app-controlled English label. Apply everywhere files are picked (homework attach-in-form,
student upload, and any other upload point found — e.g. portal/import flows).

**Flag (plan time):** audit every `<input type="file">` in the app (grep), list them, and
confirm the shared component covers each one's needs (single vs. the cap-display the
homework ones show). One component, reused.

---

## 3. What this does NOT touch
- The grade engine, publish model, their walls — untouched.
- The homework security walls (own-class/own-child/tenant, the file-key tenant guard) —
  untouched; Item 4 ADDS a create-day validation, removes no wall.
- The storage layer / Firebase / the 3-step upload orchestration — reused as-is (Items 1,
  8 re-home and re-skin it, don't change it).
- The due-date-respects-school-days rule from v0.8.2 — unchanged (Item 4 is a SEPARATE
  create-day rule, not a change to the due-date rule).

---

## 4. Flagged questions for the plan (recommendations inline)
- **Q-a (Item 1):** attach-during-create ordering — recommend (b) create-then-attach-on-
  submit (no orphan DRAFT).
- **Q-b (Item 4):** confirm the timetable-knowledge reuse (teacher's slots for this class
  on today's weekday) — NOT a resolution reimplementation; and "today" = server current
  date, respecting today's school-day/holiday state.
- **Q-c (Item 7):** the drill-in page audit + explicit-back-link (recommend) vs.
  navigate(-1).
- **Q-d (Item 8):** the file-input audit (grep every `<input type="file">`) + one shared
  component covering each.

---

## 5. Build order (numbered — each = one Claude Code session: plan → approve → build →
PROVE → commit → push → chat reviews the diff)

*Grouped so each step is coherent and reviewable. Backend rule first, then the homework
UX, then the two site-wide passes.*

1. **Calendar-aware homework days (Item 4) — backend rule + frontend surfacing.** The
   create-day validation reusing the timetable's teach-this-class-on-this-weekday
   knowledge; the 400 surfaced legibly. e2e: a teacher can't create homework for a class
   on a day they don't teach it; can on a day they do; the rule is create-day not
   due-date; tenant/assignment walls intact.
2. **Homework authoring refinements (Items 1, 2, 3) — frontend.** Attachments into the
   create form (Q-a ordering), relabel the dialog → Submissions, conditional student
   upload. Reuses the existing attach orchestration. Web tests: attach-in-form flow;
   relabeled view; student upload shown only when requiresUpload.
3. **Per-submission modal + homework styling (Items 5, 6) — frontend.** The clickable
   per-student submission modal (reusing the download-url endpoint); the student + teacher
   page styling pass. Web tests: the modal opens with the submission + download; styling
   is presentation-only (no behavior-test change beyond what's already covered).
4. **Site-wide back buttons (Item 7) — frontend.** The audited drill-in pages get the
   shared back affordance. Web tests: the back control renders on the drill-in pages and
   navigates to the right parent.
5. **Site-wide styled file input (Item 8) — frontend.** The shared styled file-input
   component, replacing every raw `<input type="file">` (audited). Web tests: the
   component renders/handles selection; the homework upload paths still work through it.
6. **Walk + tag v0.8.3.** Walk the refinements (attach-in-form, calendar-aware days,
   submission modal, styling, back buttons, styled file input), confirm v0.8.2's homework
   still works, tag.

---

## 6. How to start
Resolve the flagged questions at each step's plan (recommendations in §4). Item 4 is the
one backend rule (step 1); the rest is frontend. No grade engine, no wall removed, the
storage layer reused as-is. Hold the freeze: eight items, then tag. New discoveries → the
post-tag list (v0.8.4 Lessons is next regardless).
