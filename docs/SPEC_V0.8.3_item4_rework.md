# SPEC — v0.8.3 Item 4 REWORK: Due-Date-Is-A-Teaching-Day (replaces the create-day rule)

**Status:** DRAFT for approval. No code until approved. Build when rested — this is a
design change (new endpoint + picker logic + seed + test rework), not a one-liner.
**Context:** v0.8.3 steps 1-5 are built but NOT tagged. Step 1 shipped a "create-day"
calendar rule for homework that the walk exposed as the wrong model: it rejects based on
whether the teacher teaches the class *today* (an invisible condition), which is confusing
next to a due-date picker, and it blocked every create on the walk because the dev DB has
only one timetable slot and today wasn't it.

**The decision (Dami, confirmed):** retire the create-day rule. Instead, the due-date
PICKER disables non-teaching days, and the backend validates the due date is a day the
teacher teaches that class. The calendar becomes self-explanatory — you can only pick days
that work, no mysterious 400.

---

## 1. The precise rule

A valid homework **due date** = ALL of:
1. **Not in the past** (future or today — today already handled by the picker's existing
   minDate="today").
2. **A school day for that class** — not a holiday, not Sunday, not a Saturday when the
   class has `includesSaturday: false`. (Reuses `isSchoolDayForClassOnDate`, already built
   and used by the existing due-date rule.)
3. **A weekday the teacher teaches that class** — the teacher has at least one
   `TimetableSlot` for this class on that date's weekday, in the current session. (Reuses
   `teacherTeachesClassOnDate`, built in step 1 — just applied to the DUE DATE instead of
   "today".)

The picker DISABLES any date failing any of the three. The backend VALIDATES the same
three as a backstop (a stale picker shouldn't be able to POST an invalid due date).

**What's retired:** `assertCreateDayAllowed` (the "teaches today" create-day check) is
removed entirely. The homework can be AUTHORED on any day; what's constrained is the DUE
DATE (must be a teaching day for the class). This is the model Dami's "disable the calendar
to only days he's available" request implies, and it removes the invisible-today 400.

---

## 2. Backend

### 2.1 Retire the create-day check
- Remove `assertCreateDayAllowed` from `createHomework` (homework.service.ts). Remove the
  method. (`teacherTeachesClassOnDate` on CalendarService STAYS — it's now reused by the
  new due-date validation + the new endpoint below.)

### 2.2 New due-date validation
- `assertDueDateIsSchoolDay` (the existing due-date validation) is EXTENDED (or a sibling
  added) to also require `teacherTeachesClassOnDate(schoolId, teacherUserId, classArmId,
  dueDate)`. So the due date must be both a school day AND a teaching-weekday for the
  teacher+class. Applies on create AND on update-when-dueDate-changes (the existing
  due-date check already fires on both — this rides the same path).
- The 400 message when the due date isn't a teaching day: "The due date must be a day you
  teach this class." (Distinct from the holiday/school-day message, OR a combined message —
  decide at plan: a combined "The due date must be a school day you teach this class" may
  be simpler and covers both reasons, since from the teacher's view the fix is the same:
  pick an enabled day in the picker.)

### 2.3 New endpoint: the teacher's teaching-weekdays for a class
- The picker needs to know WHICH weekdays to enable. New endpoint, e.g.
  `GET /homework/teaching-weekdays?classArmId=&subjectId=` (TEACHER, via
  assertTeacherAssignment) → returns the set of weekdays the teacher teaches that class in
  the current session (e.g. `["MONDAY", "WEDNESDAY"]`), derived from the teacher's
  `TimetableSlot` rows for that class (day-level, any period — reuses the same
  TimetableSlot query shape as `teacherTeachesClassOnDate`, just returning the distinct
  weekdays instead of a boolean).
- **Flag at plan:** confirm the exact query (distinct `dayOfWeek` for
  teacherUserId+classArmId+sessionId) and that it's additive (new read endpoint, no schema
  change). The picker combines this with the holiday/school-day info it may already have,
  or the backend 400 remains the holiday backstop (holidays are date-specific, not
  weekday-specific, so the picker may enable a teaching-weekday that's a holiday — the
  backend 400 catches that; OR the picker also fetches holidays to disable them. Decide at
  plan: simplest is picker disables non-teaching-weekdays + past, backend 400 catches a
  holiday-on-a-teaching-weekday. Confirm the division.)

---

## 3. Frontend

### 3.1 The due-date picker disables non-teaching days
- In `HomeworkFormDialog`, the due-date `StyledDatePicker` is configured to DISABLE dates
  that aren't a teaching weekday for the class. flatpickr supports `disable` with a
  function `(date) => boolean` — disable when the date's weekday is NOT in the fetched
  teaching-weekdays set (and keep the existing `minDate="today"` for past dates).
- The form fetches the teaching-weekdays (§2.3) for the current class+subject when it
  opens (a new hook, e.g. `useTeachingWeekdays({classArmId, subjectId})`).
- **Holidays:** per the §2.3 flag — either the picker also disables holiday dates (if it
  fetches them), or a teaching-weekday that happens to be a holiday stays enabled in the
  picker but the backend 400s it (with the message surfaced via the existing getErrorMessage
  path). Recommend the simpler division (picker = weekday + past; backend = holiday
  backstop) unless the plan finds holiday data is already easily available to the form.

### 3.2 The 400 still surfaces legibly
- The backend 400 (if a disabled-but-submitted date slips through, or a holiday on a
  teaching weekday) surfaces via the existing `getErrorMessage` path in HomeworkFormDialog
  (already proven — it's how the current due-date 400 shows). No new frontend error
  mechanism.

---

## 4. Seed a realistic timetable (so the walk works)
- The dev DB has exactly ONE TimetableSlot (one Monday, Bola/JSS1A/Math, manually created
  during a prior walk). seed.ts seeds ZERO slots. So even a perfect fix shows only Mondays
  enabled — unwalkable.
- Add to seed.ts: a realistic timetable for at least Bola + JSS1A (e.g. Mathematics on
  Mon/Tue/Thu/Fri across a couple of periods), and ideally a few other teacher/class
  combos so the feature is demonstrable. Enough that opening the picker shows MULTIPLE
  enabled weekdays and the walk can pick one and succeed.
- **Flag at plan:** how much to seed — minimum is Bola/JSS1A on several weekdays; a fuller
  seed (all seeded teachers' main classes) makes the whole timetable + homework demo
  realistic. Recommend a modest but multi-day seed for Bola/JSS1A + maybe one other, not a
  full generated grid. Confirm scope at plan.

---

## 5. Tests
- Retire/rework the create-day e2e (the "teaches today" tests) → due-date-teaching-day
  tests: a due date on a weekday the teacher teaches the class → OK; a due date on a
  weekday they DON'T teach it → 400; a due date on a holiday (even a teaching weekday) →
  400; a past due date still rejected. (The clock-pin fixture may simplify — the due date
  is explicit input now, so less clock-dependence than the create-day rule had. Confirm:
  the due-date rule may not need the pinned clock at all, since it validates an explicit
  date param, not "today" — a real simplification over step 1's fixture.)
- New endpoint e2e: returns the correct distinct weekdays for a teacher+class;
  assignment/tenant walls.
- Frontend: the picker disables a non-teaching weekday (flatpickr disable fn), enables a
  teaching one; the teaching-weekdays hook; the 400 surfaces if submitted.

**Note:** the due-date rule validating an explicit date (not "today") likely REMOVES the
fake-timers complexity step 1 introduced across all 5 homework e2e files — a welcome
simplification. Confirm at plan whether the pinned-clock fixture can be retired.

---

## 6. Build order
Single focused step (it's one coherent change): backend (retire create-day + extend
due-date validation + new weekdays endpoint) + frontend (picker disable + hook) + seed +
tests. Plan-first as always. Then re-walk Item 4 specifically (open the form → picker shows
only teaching weekdays enabled → pick one → create succeeds → try to force a non-teaching
day → 400), confirm the other 7 v0.8.3 items still hold, then tag v0.8.3.

---

## 7. Why this is better than what shipped
- The constraint is VISIBLE (disabled dates in the picker) instead of an invisible 400.
- It constrains the meaningful thing (WHEN homework is due, tied to a day you have the
  class to collect/discuss it) instead of an arbitrary "can you author it today".
- It reuses everything already built (`teacherTeachesClassOnDate`,
  `isSchoolDayForClassOnDate`) — the logic was sound, it was just applied to the wrong date.
- It likely SIMPLIFIES the tests (explicit date param → less/no clock-pinning).
