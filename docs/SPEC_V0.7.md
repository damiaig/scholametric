# SPEC_V0.7 — "Evaluations & Grade Analytics"

**Status:** DRAFT for approval. No code until §6 build order is approved.
**Depends on:** v0.6 (The Portal) — shipped and tagged. Reopens the v0.4 grade
engine (the most load-bearing code in the system), so this is a large version,
built in careful numbered steps like every other.
**Origin:** Dami's Pronote-style vision — teachers author their own named,
described evaluations; only evaluations feed the term average; exams live in
their own parallel track; and comparative analytics (student vs class, best/worst)
surface throughout.

---

## 1. Theme

One theme: **evaluations and exams become two parallel tracks, and the report
card gains comparative analytics.** Concretely:

1. **Teachers create their own evaluations** — named and described (not the fixed
   CA1/CA2), and grade students on each.
2. **Two independent averages that never mix:** the **term average** is built from
   **evaluations only**; **exams** form a **separate track** with their own
   averages. An exam never contributes to the term/evaluation average.
3. **A dedicated Exams view** spanning the whole year, alongside the three terms.
4. **Comparative analytics** — student average vs class average, per subject and
   per evaluation, plus best/worst per assessment.
5. **Everything is scored and displayed over 100.**

This is the most **school-specific** version yet — the "exams don't count toward
the term average" rule and the "who sees best/worst" rule are decisions a real
Nigerian proprietor would answer in minutes. Speccing on Dami's judgment; a real-
school conversation before build would de-risk the weighting and visibility rules.

**Out of scope (later versions):** homework (v0.8), calendar (v0.9), file uploads
(v1.0), messaging (v1.1). No new account types. This version is grades only.

---

## 2. The two tracks (the core data-model change)

Today "term" and "exam" grades are entangled in one weighted computation (v0.4:
CA + Exam → 100). v0.7 **separates them into two parallel tracks:**

### Track A — Evaluations (drives the term average)
- A **teacher-created evaluation** belongs to a (class-arm, subject, term). It has
  a **name** and a **description** (both teacher-entered), a **max score** (see
  Q1), and per-student scores.
- A teacher can create **many** evaluations per subject per term.
- The student's **term subject average** = the average of their evaluation scores
  for that subject in that term, **expressed over 100**.
- Each individual evaluation is **shown** on the report card under its subject —
  name, description, the student's score — not collapsed into a single CA figure.

### Track B — Exams (its own separate track)
- An **exam** belongs to a (class-arm, subject, term), scored over 100.
- Exams **never** contribute to the term/evaluation average.
- Exams are viewable **two ways:** (a) a **button inside each term** shows that
  term's exams; (b) a dedicated **Exams page** (see §4) shows the whole year's
  exams, grouped by term, with per-term exam averages and a yearly overall exam
  average.

**Flagged (Q1) — max score / scale.** Everything displays over 100. Two ways to
get there: (a) every evaluation and exam is **scored out of 100** natively
(simplest — teacher enters a mark out of 100), or (b) evaluations can have any max
(e.g. out of 20) and are **rescaled to 100** for display/averaging. Recommendation:
**(a) — score everything out of 100 natively.** It matches "everything is over
100," avoids rescaling surprises, and is what teachers expect. If a teacher wants a
test out of 20, they can still enter marks and the average is over 100 only if the
inputs are. Confirm — this is the single most foundational data decision.

**Flagged (Q2) — does the old CA1/CA2/Exam structure go away?** v0.4/v0.5 used
fixed assessment components (CA1, CA2, Exam) with weights summing to 100. Teacher-
created evaluations **replace** the CA side; the Exam becomes Track B.
Recommendation: **evaluations fully replace the fixed CA components** (a school no
longer pre-defines CA1/CA2 in settings — teachers just create evaluations), and
the **Exam** concept moves to Track B. This is a real migration of existing
grade data — see Q5. Confirm.

---

## 3. Teacher-created evaluations (the new authoring capability)

- A teacher, for a subject they teach in a class-arm (same scoping as grade entry,
  reuse `resolveTeacherAccess`), can **create an evaluation**: name (required),
  description (required per Dami), max/score-basis (Q1), term.
- They then **grade** students on it — the bulk grid from v0.4, reused, now keyed
  to a specific evaluation rather than a fixed component.
- They can create **many** evaluations per subject per term.

**Flagged (Q3) — approval/publish.** v0.4 had a per-component `requires_approval`
flag and a publish flow (publish = ADMIN/PROPRIETOR). How does that map here?
Recommendation: **evaluations follow the same publish model** — a teacher creates
and enters scores (DRAFT), and results become visible to students/parents only when
**published** (publish stays ADMIN/PROPRIETOR, per v0.4). The published-only wall
from v0.6 already depends on this — the portal shows published only. So evaluations
must carry a publish state exactly like today's results. Confirm.

**Flagged (Q4) — can teachers edit/delete an evaluation after grading?** e.g.
fix a typo in the name, or delete a test created by mistake. Recommendation: **edit
name/description freely while DRAFT; deleting an evaluation with scores requires
care** (warn, and block/soft-delete if published). Scope the exact rules in the
build step. Confirm the direction.

---

## 4. The report card & the Exams view (what students/parents/staff see)

### The term view (Term 1 / 2 / 3 in the selector)
Per subject: the student's **term subject average** (evaluations only, /100), with
**each evaluation listed** beneath — name, description, score. Plus a **"Show
exams" button** revealing that term's exams for the subject (Track B), shown
separately, never folded into the average.

### The Exams view (a fourth entry in the selector)
The whole year's exams, grouped by term:
- Term 1 — all exams + **Term 1 exam average**
- Term 2 — all exams + **Term 2 exam average**
- Term 3 — all exams + **Term 3 exam average**
- **Overall exam average** — across all three terms' exams for the year

Every grade shown individually, everything /100.

### Comparative analytics (throughout)
- Per subject: **student average vs class average.**
- Per evaluation and per exam: the **student's score, the class average**, and
  **best/worst in the class.**
- A **general student average** (across subjects) and **general class average**.

**Flagged (Q5 — the big visibility decision).** Who sees the **class average** and
**best/worst**? Options: (a) staff only; (b) staff + student (a student sees the
class average and best/worst, but anonymized — just the numbers, not names); (c)
staff + student + **parent**. Recommendation: **class average and best/worst are
shown to student and parent as anonymous numbers (no names)** — this is the
Pronote experience Dami wants — but this is genuinely the proprietor's call, since
"your child is worst in class, visible to the parent" carries weight. **Strongly
recommend confirming this one with a real school before building §4's analytics.**
Confirm the direction, and confirm best/worst are always **anonymous** (numbers,
never "worst = [name]").

---

## 5. Data migration & the grade-engine rewrite (the load-bearing part)

- v0.4's computation (weighted CA+Exam → 100, positions, publish, absent handling
  from v0.5) is **reopened.** The term average becomes "average of evaluations";
  the exam track computes separately. Absent handling (v0.5) must carry over —
  an absent on an evaluation excludes it from that student's average, same honest-
  denominator rule as today.
- **Existing grade data** (schools already using v0.4/v0.5 CA1/CA2/Exam results)
  needs a migration story. Since there is **no real pilot school yet**, the
  seed/dev data is the only data — so this can be a clean cutover rather than a
  live migration. Recommendation: **treat it as a schema cutover** (new evaluation
  + exam tables; re-seed), not a live data migration — confirm there's no real
  school data to preserve. If a pilot school onboards before v0.7 ships, revisit.

**Flagged (Q6) — position/ranking track.** Nigerian report cards rank students.
Rank on **the evaluation (term) average**, **the exam average**, or **both shown
separately**? Recommendation: **rank on the term (evaluation) average** as the
primary position (it's the continuous, whole-term measure), and optionally show an
**exam position** separately in the Exams view. Confirm which track ranks — this
affects the position computation directly.

---

## 6. Build order (numbered — each = one Claude Code session: plan → build → PROVE (real e2e + live stack, now on the ISOLATED test DB from v0.6) → commit → push → chat reviews the diff)

*Proposed — adjust after Q1–Q6. Data model first (it's the foundation), then
authoring, then the exam track, then the views, then analytics.*

1. **Evaluation + exam data model + grade-engine rewrite.** New tables for teacher-
   created evaluations (name, description, scores, publish state) and exams as a
   separate track; term average = evaluations only; exam averages separate;
   positions per Q6; absent handling carried from v0.5. Schema migration (create-
   only + hand-reviewed SQL per CLAUDE.md). Multi-tenancy + e2e throughout. This
   is the big one.
2. **Teacher-created evaluations authoring.** Teacher creates/names/describes
   evaluations (scoped like grade entry), grades via the reused bulk grid, publish
   model per Q3, edit/delete per Q4. e2e (teacher scoping, multi-tenancy, publish).
3. **Exam track + the two exam views.** The per-term "Show exams" button and the
   dedicated year-long Exams page (per-term exam averages + yearly overall). e2e.
4. **Report-card term view.** Per-subject evaluation average /100 with each
   evaluation (name/description/score) listed; reuse and extend the v0.5/v0.6
   ReportCardDocument (shared staff + portal). Published-only wall holds. e2e.
5. **Comparative analytics.** Student vs class average per subject/evaluation/exam;
   best/worst per assessment (anonymous, per Q5); general student + class averages.
   The visibility rule (Q5) enforced server-side. e2e incl. the visibility boundary.
6. **Acceptance + tag v0.7.0.** Fresh-stack walk on the ISOLATED test DB: teacher
   creates evaluations → grades → publishes → term average is evaluations-only →
   exams show separately in both views → analytics show correctly with the right
   visibility → everything /100. Then Dami's Mrs.-Nwachukwu pass (teacher hat:
   create/grade an evaluation; parent hat: see the analytics), then tag.

---

## 7. How to start
Resolve Q1–Q6 (recommendations in §2–§5). The two that most need real-school input
are **Q5 (who sees class average / best-worst)** and the **weighting rule itself**
(exams excluded from term average — confirmed by Dami, but worth a proprietor's
nod). Approve §6, then step 1 is a plan-first Claude Code prompt. Hold the line:
this is Evaluations & Analytics — not homework, not calendar. And build on v0.6's
isolated test DB, never the dev DB.
