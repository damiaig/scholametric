# SPEC_V0.5.1 — "Organization & Polish"

**Status:** DRAFT for approval. No code until §5 build order is approved.
**Depends on:** v0.5.0 (Report Cards) — shipped and tagged.
**Origin:** findings from Dami's Mrs.-Nwachukwu pass on v0.5. None are Report
Cards regressions; all are pre-existing organization gaps, polish, or one small
fix that the hands-on pass surfaced.

---

## 1. Theme

One theme: **make the data and the flows organized** — the system should not let
a school exist in a state a real school never would (subjects nobody teaches,
teachers seeing every class, grade entry that roams anywhere), and the grade-
entry experience should be styled and guided. This is a cleanup/hardening
version between two feature versions, deliberately kept separate so polish
doesn't tangle with v0.6.

Out of scope: any new feature (homework, calendar, etc. — those are v0.6+). No
new gradebook/teacher-created-assessments (that's a separate future feature,
already noted on the roadmap).

---

## 2. The findings (what we're fixing)

### 2.1 — Subject not taught in a class → not part of that class (STRUCTURAL)
Today a subject with **no teacher assigned to a class** still appears in that
class's grade entry (e.g. Economics shows for JSS 1 A though no one teaches it
there). **Decided rule:** a subject exists for a class **only once a teacher is
assigned to teach it there**. So a subject with no teacher assigned to a class is
hidden **everywhere for that class** — grade entry, grades overview, AND the
report card — not just entry.

**Flagged (Q1):** what does this mean for *existing* data where a class already
has grades for a subject that has no teacher assignment (e.g. seed data)? Two
options: (a) hide it retroactively (a class that was graded but has no teacher
assignment for that subject stops showing it — could hide real historical data),
or (b) apply the rule going forward and treat existing orphan-graded subjects as
a data-cleanup task. Recommendation: **(b)** — the rule governs what's
grade*able*/shown, but don't destroy or hide data that already has real grades;
instead surface those as "needs a teacher assigned" rather than silently hiding.
Confirm.

### 2.2 — Adding a subject to a class forces a teacher assignment
When an admin adds a subject to a class, the system should **require** assigning a
teacher (even one who teaches elsewhere) in the same action — so you can never
create an orphan subject (the root cause of 2.1). Pairs with 2.1: 2.2 prevents
new orphans, 2.1 handles how any existing/edge orphans behave.

### 2.3 — "Enter grades" locked to the class AND subject you entered through
Today the grade-entry grid opens with free Class / Subject / Component dropdowns
that can roam to **any** class or subject, even when you arrived by clicking
"Enter grades" next to a specific subject. **Decided:** arriving via a specific
"Enter grades" link locks the grid to **that class and that subject** — the
component (CA1/CA2/Exam) and term stay selectable, but class and subject do not
roam. Admins/proprietors still grade any class/subject — but by choosing *which*
"Enter grades" link they click, not via roaming dropdowns.

**Flagged (Q2):** should there also be a general "Enter grades" entry point (not
from a specific subject) where the pickers *are* free — for an admin who just
wants to jump around? Or is every grade-entry always reached from a specific
subject link now? Recommendation: **keep a scoped-by-default flow** — always
enter from a subject link; if a free-roam entry is ever wanted, add it later as
an explicit admin tool. Confirm.

### 2.4 — Teacher sees only their own classes/students (VISIBILITY)
Confirmed on the pass: a teacher currently sees **every class in the school** in
the Classes list and can open a class they don't teach and see its students.
(Grade scoping holds — they **cannot** see or enter grades for a class they don't
teach; this is visibility only, not a permission leak.) **Fix:** a teacher's
Classes list and student visibility is scoped to the classes they teach (class-
teacher or subject-teacher). Admin/proprietor still see everything.

**Flagged (Q3):** "classes they teach" = class-teacher-of OR subject-teacher-in.
A subject teacher for JSS 3 A Math should see JSS 3 A (they teach there). Confirm
that's the scoping rule, and confirm whether a teacher should see the *student
list* of a class they teach a subject in, or only the roster relevant to their
subject. Recommendation: see the classes they teach (either role); within those,
see the students — matches how they'd grade. Confirm.

### 2.5 — Admin/proprietor can mark absent AFTER publish (FIX)
Today, once a grade is PUBLISHED, no one can mark a student absent — the publish-
lock blocks it. **Fix:** admin/proprietor can mark a published student **absent**
(the real case: a teacher entered a score, but the student was actually absent,
discovered after publishing). This must work **through** the publish-lock the
same way **override** already does — admin/proprietor only; teachers still cannot
touch a published result. Because absent **changes the total** (absent
contributes nothing), marking-absent-after-publish must **recompute** the total/
grade/position and re-publish the corrected result, exactly like override's
recompute path.

**Flagged (Q4):** is the reverse also needed — un-marking absent (restoring a
score) on a published result? Recommendation: support both directions for
admin/proprietor (mark absent, and correct back to a score) since both are
"admin fixes a published mistake"; but if you only want mark-absent for now, say
so. Confirm.

### 2.6 — Style the Enter grades screen + general UI polish
The grade-entry screen (and general UI) should be styled/cleaned up. This is
presentational — no behavior change. Scope the specific polish items during the
build step; the headline is the Enter-grades grid.

### 2.7 — Per-account in-app guide
An in-app guide per account type (admin/proprietor, teacher) explaining what that
account can do and how — so a real user isn't lost. Lightweight (a help panel or
page), not a tour framework.

**Flagged (Q5):** how deep — a short static "what you can do" page per role, or
contextual help on each screen? Recommendation: **a simple per-role help page**
for v0.5.1 (static, clear, printable), contextual/inline help deferred. Confirm.

---

## 3. What is NOT changing (confirmed working on the pass)
- Teacher has no Settings access (Terms / Assessment Structure admin-only) —
  correct, unchanged.
- Grade scoping: a teacher genuinely cannot see or enter grades for a class they
  don't teach — the security boundary holds; 2.4 is visibility only.
- Report Cards themselves (v0.5) — passed acceptance, unchanged.

---

## 4. Data / enforcement notes (confirm in build steps)
- 2.1/2.2 are enforced at the **subject-teacher-assignment** relationship: a
  subject is "for a class" iff a subject_teacher_assignment exists for that
  (class-arm, subject, session). Grade entry, overview, and report card all
  filter subjects by that existence.
- 2.5 needs a write path for admin/proprietor to set is_absent on a PUBLISHED
  result that mirrors override's lock-bypass + recompute + re-publish, respecting
  the same advisory locks (term → subject → conditional-class-arm) so it can't
  race a concurrent save. Backend + a UI control on the review/overview screen.
- 2.4 scopes the classes-list and student-visibility endpoints by teacher
  relationship (reuse the existing resolveTeacherAccess helper — same "class-
  teacher or subject-teacher" rule already used for report-card read access).
- All changes preserve multi-tenancy (school_id, cross-tenant 404) and get e2e
  coverage per CLAUDE.md.

---

## 5. Build order (numbered — each = one Claude Code session, plan → build → PROVE → commit → push → chat reviews the diff)

*Proposed — adjust after Q1–Q5. Backend/data rules first (they're the
structural ones), then the visibility scoping, then the after-publish-absent fix,
then the UI polish + guide.*

1. **Subject-for-a-class rule + forced teacher assignment (2.1 + 2.2).** Enforce
   "subject exists for a class iff a teacher is assigned"; filter grade entry /
   overview / report card by it; force teacher assignment when adding a subject
   to a class. Handle existing data per Q1. e2e.
2. **Teacher visibility scoping (2.4).** Scope the classes list + student
   visibility to the teacher's own classes (reuse resolveTeacherAccess). Admin
   unchanged. e2e (teacher sees only own; admin sees all; cross-tenant 404).
3. **Enter-grades locked to class+subject (2.3).** The grid, when entered via a
   subject link, locks class+subject; component/term stay selectable. e2e/web
   test that the lock holds and admin still reaches any subject via its link.
4. **Mark-absent-after-publish (2.5).** Admin/proprietor write path through the
   publish-lock (mirror override): set absent on a published result, recompute +
   re-publish, correct locks, teachers still blocked. e2e incl. the recompute and
   the concurrency/lock behavior.
5. **UI polish — Enter grades styling (2.6)** + any other agreed polish.
6. **Per-role in-app guide (2.7).**
7. **Acceptance + tag v0.5.1.0** (or v0.5.1) — fresh-stack walk of the fixed
   behaviors + Dami's re-pass on the exact things that were broken.

---

## 6. How to start
Resolve Q1–Q5 (recommendations in §2), approve §5, then step 1 is a plan-first
Claude Code prompt, same loop as every version. Hold the line: this is
organization & polish, not new features.
