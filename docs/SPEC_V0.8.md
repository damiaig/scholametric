# SPEC_V0.8 — "Calendar & Timetable"

**Status:** DRAFT for approval. No code until §7 build order is approved.
**Depends on:** v0.7.4 (Publish Model, Final) — tagged. The grade system is complete;
this opens a NEW domain (scheduling), largely independent of the grade engine.
**Origin:** Dami wants a Pronote-style timetable + calendar. It's sequenced BEFORE
Homework (v0.8.1) deliberately: Homework's due dates and "next school day" logic depend
on the calendar knowing term dates, holidays, and school days. Build the calendar
foundation first; Homework sits on top of it.

**This is a large new subsystem** — the biggest since the grade engine. It has several
distinct pieces (bell schedule, term/holiday calendar, repeating weekly timetable,
per-date exceptions, absence/replacement flow, four role views). ~5-6 build steps.
Built foundation-first, one reviewable step at a time.

**Frozen scope — the pieces below, nothing added after this:**
1. **Periods / bell schedule** — the school defines its own periods (variable length,
   1-2 hours), globally for the school.
2. **Calendar** — term start/end dates, holidays, and non-school-days (per-class
   allowed; Saturday possible for some classes, **never Sunday**).
3. **Repeating weekly timetable** — a base weekly template per class (which teacher
   teaches which subject in which period), repeating within the term.
4. **Date-specific exceptions** — a teacher marks themselves absent for a period (with a
   note, auto-approved) → that class period shows **"Cancelled — teacher absent"**; a
   proprietor can **replace** a cancelled period (another teacher / activity).
5. **Breaks** — editable; a break change is **global** across the day (not per-class).
6. **Four views** — proprietor builds; teacher sees their own timetable; student/parent
   see their class's full timetable; a **live daily agenda** (Pronote-style "for today").

Anything new at the acceptance walk → POST-TAG list, not this cycle.

---

## 1. Theme

One theme: **a school calendar and timetable, Pronote-style.** The proprietor builds a
repeating weekly timetable inside a term; students/parents/teachers see their relevant
schedule; teachers can mark themselves absent (auto-approved, class shows cancelled);
the proprietor can replace a cancelled period. The calendar owns term dates, holidays,
and school days.

**Independent of the grade engine** — this domain doesn't touch grades/evaluations/
exams/publish. New models, new endpoints, new UI. The multi-tenant + security wall
(school scoping, role guards) applies exactly as everywhere else.

---

## 2. Data model (new)

New models (names indicative — finalized at Step 1 plan):

- **Period** (the bell schedule, school-wide): `{ schoolId, name/label (e.g. "P1"),
  startsAt (time), endsAt (time), sortOrder }`. Variable length. Defined once per school.
- **Break** (global, school-wide): `{ schoolId, name (e.g. "Lunch"), startsAt, endsAt }`
  — editing a break is global across the day, not per-class (Item 5).
- **Term** — ALREADY EXISTS (`Term` model, with a session). This spec ADDS what the
  calendar needs: term start/end dates (confirm whether Term already carries startsOn/
  endsOn — from earlier work it does; if so, reuse, don't duplicate).
- **Holiday**: `{ schoolId, name, date (or startDate/endDate range), sessionId/termId }`
  — a no-school day school-wide.
- **ClassSchoolDays** (per-class school-day config): which weekdays a class has school.
  Default Mon-Fri; a class MAY add Saturday; **Sunday is never allowed** (hard validation).
- **TimetableSlot** (the repeating weekly template): `{ schoolId, classArmId, dayOfWeek
  (Mon-Sat, never Sun), periodId, subjectId, teacherUserId, sessionId/termId }`. This is
  the base grid that repeats every week within the term.
- **TimetableException** (date-specific override): `{ schoolId, classArmId, date, periodId,
  type (CANCELLED_TEACHER_ABSENT | REPLACED | ...), note?, replacementTeacherUserId?,
  replacementSubjectId?/activityLabel?, createdByUserId }`. Laid on top of the repeating
  template for a specific date.
- **TeacherAbsence** (the absence record): `{ schoolId, teacherUserId, date, periodId(s),
  note, autoApproved: true }` — drives the CANCELLED exceptions for that teacher's slots
  on that date. Auto-approved (no admin approval step — the note just goes on record).

**Flagged (Q1) — Term start/end.** Confirm whether the existing `Term` model already has
start/end dates (from v0.4/v0.5 term-close work) — if yes, the calendar reuses them and
does NOT add a duplicate. Step 1 plan confirms.

**Flagged (Q2) — how exceptions compose with the template at read time.** The agenda/
timetable for a given date = the repeating TimetableSlots for that weekday, MINUS
holidays/non-school-days, WITH TimetableExceptions for that date overlaid (a cancelled
period shows cancelled; a replaced period shows the replacement). Recommend computing
this ON READ (resolve template + exceptions for the requested date/range), not
materializing every date. Confirm on-read composition.

---

## 3. Building the timetable (proprietor)

- The **proprietor** (and/or school-admin — confirm Q3) builds the repeating weekly
  timetable: for each class, each school weekday, each period → assign subject + teacher.
- Defines the **periods** (bell schedule) and **breaks** once; break edits are global.
- Sets **holidays** and **per-class school-days** (Saturday opt-in, never Sunday).
- Validation: no double-booking a teacher in the same period across classes; a slot's
  teacher must be assigned to teach that subject (reuse the existing subject-teacher
  assignment data); Sunday rejected.

**Flagged (Q3) — who builds it.** Proprietor only, or proprietor + school-admin? Recommend
both (matches the admin's existing school-management scope), unless you want timetable-
building proprietor-only. Confirm.

---

## 4. Teacher absence + replacement

- A **teacher** opens their timetable → marks themselves **absent** for a specific period
  (or periods) on a date → adds a **note** → **auto-approved** (recorded, note goes to the
  proprietor's view, no approval gate).
- Effect: that teacher's slots for that date/period show **"Cancelled — teacher absent"**
  on every affected class's timetable + the student/parent agenda.
- A **proprietor** can **replace** a cancelled period: assign a **replacement teacher**
  (cover) and/or a replacement subject/activity → the period then shows the replacement
  instead of "cancelled." (Confirm Q4: replacement = another teacher covering the same
  subject, or a free-form activity/other, or both.)

**Flagged (Q4) — replacement shape.** Recommend: replacement can be (a) another teacher
covering (pick a teacher), optionally (b) a different subject/activity label. Both
supported, both optional. Confirm.

**Flagged (Q5) — absence granularity.** A teacher marks absent per-period on a date (not
a whole day necessarily — they might miss one period). Recommend per-period selection on
a date (can select multiple periods / whole day). Confirm.

---

## 5. The four views

1. **Proprietor builder** — a grid to build/edit the weekly template per class, manage
   periods/breaks/holidays/school-days.
2. **Teacher's own timetable** — the teacher sees only their own periods across the
   classes they teach (their week), plus their absence-marking control.
3. **Student/parent class timetable** — the student sees their class's full weekly
   timetable; parent sees it per child (child-switcher, reusing the portal pattern).
   Periods variable-length, breaks shown, cancellations/replacements shown.
4. **Live daily agenda** — the Pronote-style "for today" view (the screenshot): the
   day's periods in order, subject + teacher, breaks, "no class"/"cancelled" states,
   for whoever's viewing (their own day). Groups by today / upcoming days.

**UI quality is explicit scope** — the agenda + timetable must look clean and Pronote-
like (Dami's requirement). Reuse the established card/design language.

**Security/visibility:** teachers see their own; students/parents see only their own
class/children (reuse the existing own-child wall); the timetable is not sensitive the
way grades are, but tenant scoping + own-class scoping still apply.

---

## 6. What this does NOT include (parked)

- **Homework** — v0.8.1, built on this calendar.
- **File storage / Firebase** — not needed here (no files in the calendar); arrives with
  Homework.
- Notifications/push for absences — out of scope (the note goes to the proprietor's view;
  real push notifications are a later concern).

---

## 7. Build order (numbered — each = one Claude Code session: plan → approve → build →
PROVE → commit → push → chat reviews the diff)

*Foundation first (periods + calendar), then the timetable, then exceptions/absence,
then views.*

1. **Foundation: periods (bell schedule) + breaks + holidays + per-class school-days.**
   The models + proprietor CRUD for periods/breaks/holidays/school-days. Sunday-never
   validation. Reuse existing Term start/end (Q1). e2e: CRUD, Sunday rejected, tenant
   scoping.
2. **The repeating weekly timetable template.** TimetableSlot model + proprietor builder
   (assign subject+teacher per class/weekday/period) + validation (no double-book, teacher
   must teach the subject, Sunday rejected). e2e: build a week, validation blocks.
3. **On-read composition + the class/teacher timetable views.** Resolve template +
   holidays + school-days for a date/range (Q2, on-read). Teacher-own view + student/
   parent class view. e2e: the resolved week excludes holidays, respects per-class
   school-days, scoping holds.
4. **Exceptions: teacher absence (auto-approved) + proprietor replacement.** Teacher
   marks absent per-period+note → CANCELLED exception → shows on agendas; proprietor
   replaces → REPLACED exception. e2e: absence cancels the right slots, replacement
   overrides cancelled, only own-class visibility.
5. **The live daily agenda (Pronote-style) + UI polish.** The "for today / upcoming"
   agenda view for teacher/student/parent, clean Pronote-like UI. Reuses Step 3's
   on-read resolution.
6. **Acceptance walk + tag v0.8.** Proprietor builds a timetable; teacher sees own +
   marks absent; proprietor replaces; student/parent see the class agenda with the
   cancellation/replacement; holidays/school-days respected; Sunday impossible. Then tag.

---

## 8. How to start
Resolve Q1-Q5 (recommendations in §2-§4). Q2 (on-read composition of template +
exceptions) and the (A) repeating-template-plus-date-exceptions model are the load-
bearing structure — confirmed with Dami: base weekly template repeats within the term,
date-specific exceptions overlaid. Approve §7. This is a new domain — the grade engine,
publish model, and their walls are untouched; the multi-tenant + role guards apply as
everywhere. Hold the freeze: the scope above, then tag. New discoveries → post-tag list.
After v0.8, Homework (v0.8.1) is built on this calendar.
