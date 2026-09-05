# SPEC_V0.7.2 — "Pronote Flow"

**Status:** DRAFT for approval. No code until §5 build order is approved.
**Depends on:** v0.7.1 (Navigable & Appealing) — built, not yet tagged (deliberately
held so the tag lands on the final navigation model, per Dami's call).
**Origin:** Dami's acceptance walk of v0.7.1. The navigation is findable now, but
three things surfaced from real use: (1) the average should update continuously
after each grade like Pronote, not wait for the whole term; (2) all grading should
happen on the Grades page — the class page should be a read-only view, not a place
you edit scores; (3) the student Grades page reads like a raw printout, not a
designed page. A suspected publish bug was diagnosed and found NOT to be a bug
(nothing was published for the subject in question — the "draft" badge was honest),
so it is not in scope.

**Frozen scope — exactly four items, nothing added after this:**
1. Pronote-style running average (backend computation + display).
2. All grading on the Grades page.
3. Class page = read-only view.
4. Restyle the student Grades page (design approved by Dami).

Anything new discovered during the acceptance walk goes on a POST-TAG list, not into
this cycle. This is the discipline that ends the iteration and lets v0.7 close.

---

## 1. Theme

One theme: **make grades flow like Pronote** — a live average that updates as grades
come in, one place to do all grading, a clean designed grades page, and a class page
that's a hub, not a workspace.

**What this touches:** unlike v0.7.1 (pure frontend), item 1 (running average) is a
GENUINE backend change — it reopens the grade engine (the most load-bearing code in
the system). That step gets the full plan → build → PROVE → diff-review care we gave
v0.7 Step 1, and its own e2e coverage. Items 2, 3, 4 are frontend-only.

**What this does NOT touch:** the published-only walls, the anonymity rule, the
teacher-scoping/authority rules, multi-tenancy — none move. The running average is a
NEW computed figure; it does not weaken any existing gate. Confirm per step.

---

## 2. Item 1 — Pronote-style running average (backend + display)

**The behavior:** today the overall average only exists once EVERY subject is
published (that's why students see `—` mid-term). Pronote instead shows a **running
average** that updates after each grade: it averages each subject from whatever's
graded so far, then averages across subjects — continuously.

**What changes:**
- A **running / provisional average** is computed from the subjects that HAVE published
  results so far, rather than requiring all subjects published. Shown as "your average
  so far" (label makes clear it's provisional, updating).
- This surfaces on: the student/parent **dashboard** (replacing the `—` when at least
  one subject is published) and the redesigned **Grades page** summary strip.

**Flagged (Q1) — where does it compute, and does it disturb the "final" overall?**
The existing `TermOverallResult` (the official term average + ranking) is gated to
"all subjects published" and drives the report card's official Overall block and
position. The running average is a DIFFERENT, softer number ("so far"). Recommendation:
compute the running average as a SEPARATE figure (on-read or a distinct field) that
does NOT replace or alter `TermOverallResult` — the official overall stays exactly as
it is (still "not yet available" until fully published), and the running average is an
ADDITIONAL provisional display. This keeps the proven engine untouched and adds a
provisional number beside it. Confirm — this is the key design decision: running
average is additive, not a replacement for the official overall.

**Flagged (Q2) — published-only still holds.** The running average must be computed
over PUBLISHED subject results only (a student's provisional average must not include
an unpublished subject's number, and a parent's must not leak an unpublished
classmate's data into any class figure). Same wall as v0.7, applied to the new number.
Confirm reuse of the existing published-gating, not a new path.

**Position while provisional:** stays "Not yet ranked" until the official overall
exists (ranking a partial term is misleading). Only the AVERAGE goes provisional, not
the rank. Confirm.

---

## 3. Item 2 + 3 — All grading on the Grades page; class page = read-only view

**Item 2 — Grades page owns the whole grading workflow.**
Today (v0.7.1) the teacher Grades page is a PICKER that routes into
`/classes/arms/:id/grades` to actually enter scores. Dami wants the entire flow —
pick class → pick subject → enter scores → see results → publish — to happen ON the
Grades page, never bouncing to a class URL.

Recommendation: make the Grades page the actual home of the grading workflow (the
Enter-scores / Results tabs live under the Grades route, scoped by a class+subject the
teacher selects there), rather than a picker that hands off to the class route. This is
a re-architecture of the v0.7.1 Step-1 routing — the class-grades area moves under
Grades. Reuse the existing `ClassGradesPage`/`EnterScoresTab`/`ResultsTab` components
— this is where they LIVE now, reached from Grades, not from the class page.

**Item 3 — class page becomes a read-only view/hub.**
The class page (`/classes/arms/:id`) becomes: see the class, see the roster, click a
student → view their profile. **Zero grade entry or editing anywhere on the class
side** — no "Enter grades" button, no Grades tab on the class page. All of that lives
on the Grades page. The class page connects to things (roster, student profiles); it
doesn't do grading.

**Flagged (Q3) — reachability.** With grading removed from the class page, confirm
nothing becomes unreachable: the Grades page is the single entry to the grading
workflow (from the sidebar), and the class page's remaining value is roster +
student-profile navigation. Confirm the teacher's path to grade is: sidebar Grades →
pick class → pick subject → enter/publish, entirely within Grades.

**Flagged (Q4) — admin/proprietor.** Admins reach grades today via Classes → class →
Grades tab + Review & Publish. If the class-page Grades tab is removed, admins need
their grading path preserved. Recommendation: admins ALSO use the Grades-page flow (or
keep Review & Publish where it is for the publish half); spell out the admin path
explicitly so nothing an admin needs disappears. Confirm.

**HARD RULE for items 2/3:** frontend routing/layout ONLY — no endpoint, DTO, service,
query, or role-check touched. The grades ENDPOINTS are unchanged; this rearranges which
FRONTEND route hosts the existing components. Zero `apps/api/` diff for these two items.

---

## 4. Item 4 — Restyle the student Grades page (design approved)

The student Grades page today is the raw report-card document on a page ("artificial").
Replace with the APPROVED design (Dami signed off the mockup):
- **Header:** "Grades" + student·class + term picker.
- **Summary strip:** running average ("your average so far") + class average + position.
- **Per-subject cards:** subject name + published badge; a total strip (total /100 ·
  grade · position · class avg); evaluation rows (name, score, anonymous class
  avg/best/worst as subtext); a "Show exams" button.
- **Unpublished subjects:** clean "Not yet published — results appear here once your
  teacher publishes them" (honest empty state, no draft leak).
- Clean dashboard card language throughout (white cards, hairline borders, blue accent).

Frontend/styling only. Reuses the existing published-gated report-card data — no new
query, no anonymity change (class avg/best/worst stay anonymous numbers). The parent
grades page (per child) gets the same treatment for consistency.

---

## 5. Build order (numbered — each = one Claude Code session: plan → approve → build → PROVE → commit → push → chat reviews the diff)

*Backend first (the running average — the one real-risk step), then the frontend
re-architecture, then the restyle.*

1. **Running average (Item 1) — the grade-engine step.** Compute the provisional
   running average (additive, does NOT alter `TermOverallResult`), published-only,
   position stays "not yet ranked" while provisional. e2e: running average is correct
   over published subjects; an unpublished subject does NOT contribute; the official
   overall is unchanged; anonymity holds for the class figures. This is the heavy step
   — full care, on the isolated `scholametric_test` DB.
2. **Grades-page-all-grading + class-as-view (Items 2 + 3) — frontend re-architecture.**
   Move the grading workflow under the Grades route; strip grade entry from the class
   page (make it roster + student-profile view). Preserve the admin grading path.
   Frontend-only, zero `apps/api/` diff, existing e2e green before+after with zero e2e
   edits.
3. **Restyle student + parent Grades page (Item 4) + wire the running average into the
   summary strip.** The approved design. Frontend/styling only. Existing suites green.
4. **Acceptance walk + tag v0.7.2.** Full walk on the running-average + grades-page +
   restyled UI (teacher/admin/parent hats), fresh-stack boot check, then tag. This is
   where v0.7 CLOSES — post-tag list captures anything new, nothing more added here.

---

## 6. How to start
Resolve Q1–Q4 (recommendations in §2–§3), approve §5. Step 1 (the running average) is
the one backend step and gets the heaviest review — it reopens the grade engine, so the
diff must prove the official overall is untouched, the running average is published-only
and correct, and anonymity holds. Then steps 2–3 are frontend-only. Hold the freeze:
four items, then tag. New discoveries at the walk → post-tag list.
