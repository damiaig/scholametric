# SPEC_V0.8.1 — "Calendar Polish"

**Status:** DRAFT for approval. No code until §5 build order is approved.
**Depends on:** v0.8 (Calendar & Timetable) — built and walked, NOT yet tagged (this
polish pass lands first, then v0.8/v0.8.1 tags together or in sequence — decide at tag
time).
**Origin:** Dami's v0.8 acceptance walk surfaced a set of UX/polish issues once the
calendar was driven by hand. None are correctness bugs in the grade/security sense —
they're navigation, styling, discoverability, and one real behavior rule (can't cover a
class that already happened). Doing them properly before homework means homework sits on
a clean, finished calendar.

**Mostly frontend.** The agenda redesign, flatpickr styling, sidebar move, and the
"Today" label fix are all frontend over the existing (unchanged) timetable endpoints.
One item (§2.8, hiding Replace after the class passed) is a date/time comparison —
likely frontend (the absence date is already in the data), confirmed at plan time.

**Frozen scope — exactly eight items, nothing added after this:**
1. Agenda tab → day-based (one day at a time); Full-week grid unchanged.
2. Styled flatpickr date-picker to jump to a day.
3. Navigation floor: cannot go before today (past dates disabled; forward free, back
   only to today).
4. Fix the "Today" label — a navigated future day is not labelled "Today".
5. Weekend day in the agenda shows "No school — Weekend" (doesn't skip).
6. Styled flatpickr everywhere date inputs exist (holidays etc.), admin included.
7. Consolidate calendar into ONE "Timetable" sidebar section (build timetable +
   absences + calendar settings), remove the three dashboard cards → declutter the
   admin dashboard.
8. Replace button disappears once the absent class's date+time has passed (can't cover
   a class that already happened).

Anything new at the re-walk → post-tag list (homework territory), not this cycle.

---

## 1. Theme

One theme: **polish the calendar into its finished, usable form** — a day-by-day agenda
with a proper date-picker, correct navigation bounds, a decluttered admin nav, consistent
styled date inputs, and the one real rule that you can't cover a class that's already
happened.

**No grade-engine contact. No security-wall change.** The timetable endpoints are
unchanged (they already take any from/to). The own-class/own-child walls from v0.8
Steps 3-5 are untouched. This is presentation + one date/time rule.

---

## 2. The eight items

### 2.1 Agenda → day-based (Q1: Agenda only; Full-week unchanged)
Today the Agenda tab shows a rolling "today + upcoming days" list. Change: the Agenda
shows ONE day at a time, with day-by-day navigation (‹ prev-day / next-day ›) plus the
date-picker (§2.2). The Full-week tab is UNCHANGED — it keeps the Mon-Fri/Sat grid from
v0.8's nav fix. Reuses the SAME /me/timetable resolution, requested for a single date
(from = to = that day).

### 2.2 Styled flatpickr date-picker (jump to a day)
The date button on the Agenda opens a styled flatpickr calendar; picking a day jumps the
agenda to it. flatpickr is the chosen picker library (Dami's call). It must be styled to
match the app's design language (not the default flatpickr theme).

### 2.3 Navigation floor: no date before today
The date-picker DISABLES all dates before today (flatpickr `minDate: "today"`). Day-by-day
nav: "next day" always available; "previous day" disabled when already on today. Forward
is unbounded (within the existing 31-day-per-request cap, which single-day requests never
hit); backward stops at today. (This corrects v0.8's over-restrictive "forward-only" — the
real rule is "not before today", so you CAN return to today, just not go past it.)

### 2.4 Fix the "Today" label
A navigated future day must show its real weekday+date (e.g. "Monday · 5 Oct 2026"), NOT
"Today". Only the actual current date shows "Today". (v0.8 bug: a navigated day still said
"Today".)

### 2.5 Weekend day (Q3)
Landing on a Saturday (class without Saturday) or Sunday shows "No school — Weekend" for
that day — informative, does NOT auto-skip to the next school day. Same non-school-day
rendering the agenda already has, just per-day.

### 2.6 Styled flatpickr everywhere
Replace every plain browser `<input type="date">` in the calendar/admin surfaces (holiday
create/edit — the plain input in v0.8, and any other date field) with the same styled
flatpickr component. One shared styled date-picker component, reused. Admin side included.

### 2.7 Consolidate calendar into one sidebar section (Q2 + follow-up: one grouped section)
Today admin/proprietor reach the calendar via THREE dashboard cards: "Build timetable",
"Absences & cover", "Calendar settings". Change:
- Add ONE "Timetable" (or "Calendar") sidebar section for SCHOOL_ADMIN/PROPRIETOR,
  grouping all three destinations (a section with the three sub-links, or a landing page
  linking to the three — pick the cleaner of the two at plan time).
- REMOVE all three dashboard cards. The admin dashboard drops from 6 action cards to 3
  (Review & Publish, Exam approvals, Portal accounts) — noticeably decluttered, Dami's
  stated goal.
- The STUDENT/TEACHER/PARENT "Timetable" sidebar item (their own read view) is UNCHANGED
  — this only reorganizes the admin/proprietor calendar-management entry points.

**Flag (plan time):** does the codebase's sidebar support a collapsible/grouped section,
or is it a flat list? If flat, recommend a single "Timetable" sidebar item → a small
landing page with the three cards (build / absences / settings), rather than inventing a
new collapsible-group pattern. Confirm the cleanest option in the plan.

### 2.8 Replace button gone after the class has passed
On the admin Absences page, a cancelled period's "Replace" button must disappear once
that period's date+time is in the past — you can't assign a cover to a class that already
happened. The check: the absence has a date; the period has an endsAt (or startsAt) time;
if (that date + period time) < now, hide Replace (show a "Passed" state or just no
button).

**Flag (plan time):** is this purely frontend (the absence date + period time are both in
the /calendar/teacher-absences response, so the client can compare to now)? Confirm.
Recommend frontend if the data's present — no backend change. If the backend also needs to
REJECT a late replace-attempt (defense in depth, since a stale page could still POST),
flag whether to add that guard too (recommended: yes, a cheap backend check that a
replacement can't target a past period, so the rule holds even if the button's stale).

---

## 3. What this does NOT touch
- The grade engine, publish model, exam approval — untouched.
- The own-class/own-child security walls (v0.8 Steps 3-5) — untouched.
- The timetable resolution logic (holidays, school-days, exceptions, coverage) — untouched;
  the agenda just requests a single date instead of a range.
- The Full-week grid — unchanged from v0.8's nav fix.

---

## 4. Flagged questions for the plan (recommendations inline)
- **Q-a:** Sidebar grouped-section vs. a single "Timetable" item → landing page. Recommend
  whichever matches the existing sidebar's capability (flat list → landing page).
- **Q-b:** §2.8 replace-after-passed — frontend-only (recommend) + optionally a backend
  reject-late-replace guard (recommend yes, cheap defense-in-depth).
- **Q-c:** flatpickr — confirm it's added as a dependency and wrapped in one shared styled
  component, not sprinkled raw across pages.

---

## 5. Build order (numbered — each = one Claude Code session: plan → approve → build →
PROVE → commit → push → chat reviews the diff)

*Grouped so each step is a coherent, reviewable unit. ~2-3 steps.*

1. **Agenda day-based + navigation floor + "Today" fix + weekend day (§2.1, 2.3, 2.4,
   2.5) + the shared styled flatpickr component (§2.2).** The agenda redesign and its
   date-picker together (they're one interaction). Reuses existing resolution, single-date
   requests. Frontend-only. Web tests: day nav, can't-go-before-today, correct "Today"
   only on today, weekend day renders, picker disables past dates.
2. **Styled flatpickr everywhere (§2.6) + sidebar consolidation + dashboard declutter
   (§2.7).** Swap remaining date inputs to the shared picker; add the "Timetable" sidebar
   section, remove the three dashboard cards. Frontend-only. Web tests: date inputs use the
   styled picker; sidebar has the Timetable section; dashboard no longer renders the three
   cards; student/teacher/parent timetable item unchanged.
3. **Replace-after-passed (§2.8).** Hide Replace on a past period (frontend) + the
   optional backend reject-late-replace guard (per Q-b). Tests: Replace hidden on a past
   period, present on a future one; (if guarded) a late replace POST 400s.
4. **Re-walk + tag.** Re-walk the polished calendar (day agenda + picker + bounds, sidebar,
   replace-after-passed), confirm v0.8's walk items still hold, then tag. (v0.8 and v0.8.1
   tag together or in sequence — decide at tag time.)

---

## 6. How to start
Resolve Q-a/Q-b/Q-c (recommendations in §4). Approve §5. All frontend except the optional
§2.8 backend guard. No grade engine, no security wall, no resolution-logic change. Hold the
freeze: eight items, then tag, then homework (v0.8.2). New discoveries at the re-walk →
post-tag list.
