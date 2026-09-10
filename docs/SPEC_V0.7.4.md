# SPEC_V0.7.4 — "Publish Model, Final"

**Status:** DRAFT for approval. No code until §6 build order is approved.
**Depends on:** v0.7.3 (Teacher-owned publish + live class average) — tagged on `7ed7ced`.
**Origin:** Dami's v0.7.3 acceptance walk. The walk confirmed the mechanics work, but
using it surfaced the *final* shape the publish model should take — different from what
v0.7.3 built. This version rebuilds the publish model to that final shape. It is NOT
small: it removes the subject-level publish action, moves evaluation publish to the
individual-evaluation level, adds a brand-new exam approval workflow, and slims the
admin role. Big by design.

**This reopens the grade engine's publish/status machinery** (the overloaded
`ResultStatus` column the earlier diagnostic flagged as load-bearing across visibility,
edit-lock, ranking, overall, and completeness). It therefore gets the full plan → build
→ PROVE → diff-review care, per-step, with the same guardrails v0.7 used: the
cross-tenant/own-child security wall is SEPARATE from publish and must stay untouched;
the completeness gate stays (moved to evaluation level); the published-only walls for
students/parents hold.

**Frozen scope — exactly five items, nothing added after this:**
1. Evaluations publish **per evaluation** (each evaluation its own publish/unpublish;
   teacher-owned, no admin).
2. **Remove the subject-level publish action** — a subject has no separate "publish the
   whole subject" step; its state follows its published evaluations.
3. **Exams: teacher publishes → admin approval required → then visible** (new workflow).
4. **Admin slimmed:** no evaluation authorship/publish; can view all grades/averages,
   **approve exams**, and **unpublish** (correction).
5. **Teacher grades page shows only the teacher's own subjects** (not colleagues').

Anything new at the acceptance walk → POST-TAG list, not this cycle.

---

## 1. Theme

One theme: **finalize the publish model** — teachers own evaluations at the
evaluation level (no subject-publish ceremony), exams require admin approval, the admin
role shrinks to oversight, and each teacher sees only their own subjects. This is the
publish model as Dami wants it after living with v0.7.3.

**Reality check:** this is a real re-architecture of the status/publish machinery, not a
tweak. It is ~3–4 build steps. Ordered so the riskiest engine change (the per-evaluation
publish + removing subject-publish, which reopens the overall/ranking/completeness
logic) is done first and reviewed hardest.

---

## 2. Item 1 + 2 — per-evaluation publish; remove subject-level publish

**Today:** publish is a SUBJECT-level action — `publish()` transitions a whole subject's
`TermSubjectResult` rows to PUBLISHED at once, gated by the subject-wide completeness
check, and that action is what computes the subject total, grade, and position and makes
the subject visible to students/parents.

**Change:**
- **Publishing moves to the individual evaluation.** Each evaluation has its own
  publish/unpublish (teacher-owned). A published evaluation's scores are visible to
  students/parents; an unpublished (or unscored) one is not.
- **The subject-level "Publish" button/action is removed** — there is no separate
  "publish the whole subject" step. The subject's report-card figures (total, grade,
  position, published-vs-not) **derive from its published evaluations.**

**Flagged (Q1) — what makes the SUBJECT total final, with no subject-publish?**
This is the load-bearing design question. Today the subject total/grade/position and its
PUBLISHED status come from `publish()`. With per-evaluation publish and no subject
action, the subject's total must be computed from its **published evaluations**, and the
subject counts as "published/visible" once **it has ≥1 published evaluation** (recommend)
OR once **all its evaluations are published** (alternative). Recommendation: **the
subject is visible/counts once it has ≥1 published evaluation, and its total is the
average of its PUBLISHED evaluations so far** — this matches the Pronote-live spirit
(the subject shows as its published work accumulates) and is consistent with the running
average already built. The subject `TermSubjectResult` status becomes a DERIVED value
(PUBLISHED if ≥1 evaluation published, else DRAFT), computed on the same recompute the
per-evaluation publish triggers. Confirm this rule — it decides the whole engine change.

**Flagged (Q2) — completeness gate moves to the evaluation.** Today the gate blocks a
subject publish until every student has a score-or-absent on every evaluation. Per
evaluation, the gate becomes: **you can't publish an EVALUATION until every student has a
score-or-absent on THAT evaluation** (still "don't publish a half-graded evaluation").
Recommend keeping it at the evaluation level. Confirm.

**Flagged (Q3) — subject position / overall.** Positions and the cross-subject overall
currently key off subject PUBLISHED status. With subject status now derived, positions
recompute over subjects that have ≥1 published evaluation (the same "published-so-far"
cohort logic v0.7.3's running position already established). The official
`TermOverallResult` "all published" gate needs its definition updated to the new model —
spell out exactly in the build step. Confirm the running-vs-official distinction from
v0.7.3 is preserved (provisional figures live, official finalizes at term close/full
publish).

**HARD guardrail:** the cross-tenant / own-child wall (`resolveOwnStudentId`,
`assertChildBelongsToCaller`, etc.) is untouched — it is separate from publish. The
published-only visibility for students/parents must continue to hold at the evaluation
level (an unpublished evaluation's score never reaches a student/parent). e2e must prove
this.

---

## 3. Item 3 — exams require admin approval

**Today:** exams are published by admin/proprietor directly (teacher can't publish an
exam — v0.7.3 kept this).

**Change:** a two-step approval workflow.
- Teacher enters exam scores → clicks **Submit for approval** (or "Publish") → the exam
  enters a **PENDING_APPROVAL** state and a request is visible to the admin.
- Admin sees pending exam approvals → **approves** (exam becomes visible/PUBLISHED) or
  **rejects/returns** it.
- Teacher can see the exam's status (pending / approved) on their side.

**Flagged (Q4) — the pending state + admin surface.** The exam track already has a
`ResultStatus` with `PENDING_APPROVAL`. Recommendation: reuse it — teacher submit sets
the exam's subject-exam result to `PENDING_APPROVAL`; admin approve transitions it to
`PUBLISHED`; the admin gets a "pending exam approvals" view (a list, reusing the Review &
Publish pattern, scoped to exams). Confirm the states (teacher can submit and see
pending; admin approves/returns; only approved = visible to student/parent).

**Flagged (Q5) — completeness gate on exam submit.** Same as evaluations: a teacher
can't submit an exam for approval until every student has a score-or-absent on it.
Recommend keeping it. Confirm.

---

## 4. Item 4 — slim the admin role

**Today:** admin/proprietor can create/edit/publish evaluations, publish exams,
unpublish, override.

**Change (evaluations):** admin/proprietor **can no longer create, modify, or publish
evaluations** — teachers own evaluations entirely.
**Admin/proprietor KEEP:**
- **View** all students' grades/averages (oversight — unchanged read access).
- **Approve exams** (Item 3).
- **Unpublish** (correction / oversight) — recommend keeping admin unpublish for both
  tracks as the safety valve.
- Override (recommend: keep, it's a display-layer correction, not authorship — confirm).

**Flagged (Q6) — proprietor vs school-admin.** Confirm whether both PROPRIETOR and
SCHOOL_ADMIN get the exam-approval + unpublish powers, or only PROPRIETOR. Recommend
both (matching today's oversight split), unless you want approval to be PROPRIETOR-only.

**HARD guardrail:** removing admin evaluation-publish is a permission NARROWING — the
diff must prove nothing a teacher needs is lost and the engine logic is unchanged, only
authorization. e2e: admin can no longer publish an evaluation (403); admin can still
view, approve exams, unpublish.

---

## 5. Item 5 — teacher sees only their own subjects

**Today:** a class teacher's Grades page shows every subject in the class (including
colleagues' — e.g. Bola sees Ngozi's English), because `getClassArmResults` returns all
subjects for a class teacher.

**Change:** on the teacher's Grades page, show only the subjects the teacher is
**assigned to teach** (their own). A class teacher still can't publish others' subjects
(already true) — now they don't even see others' subjects on the grades entry/publish
surface. (Read-oversight of the whole class for a class teacher, if wanted elsewhere, is
a separate question — this is about the grades-authoring surface.)

**Flagged (Q7) — scope of "only own subjects."** Recommend: the Grades-page picker and
Results view filter to the teacher's assigned subjects. Confirm whether a class teacher
should still see the whole-class overall (all subjects) anywhere, or strictly only their
own on this page. Recommend strictly own on the grades surface.

Frontend-mostly, but the "only own subjects" filter may touch the read endpoint's
teacher-scoping — spell out whether it's a frontend filter over already-returned data or
a backend scoping change, and prefer frontend if the data's already there.

---

## 6. Build order (numbered — each = one Claude Code session: plan → approve → build → PROVE → commit → push → chat reviews the diff)

*Riskiest engine change first, then exams, then permissions/UI.*

1. **Per-evaluation publish + remove subject-publish + derived subject status (Items 1+2).**
   The heavy engine step: publish/unpublish move to the evaluation; subject
   total/grade/status/position derive from published evaluations (Q1); completeness gate
   moves to evaluation level (Q2); overall/ranking updated (Q3). The diff must prove the
   security wall + published-only visibility hold, the official-vs-running distinction is
   preserved, and no student sees an unpublished evaluation. Full e2e.
2. **Exam approval workflow (Item 3).** Teacher submit → PENDING_APPROVAL → admin
   approve → PUBLISHED; admin pending-approvals surface; completeness gate on submit
   (Q4, Q5). e2e: teacher submits, can't self-approve; admin approves; only approved is
   visible; completeness blocks incomplete submit.
3. **Slim admin + teacher-own-subjects-only (Items 4+5).** Remove admin evaluation
   authorship/publish (Q6); teacher Grades page shows only own subjects (Q7). e2e:
   admin 403 on evaluation publish, retains view/approve-exam/unpublish; teacher sees
   only own subjects.
4. **Acceptance walk + tag v0.7.4.** Teacher: per-evaluation publish, no subject-publish
   button, own subjects only, submit exam for approval. Admin: can't publish evals,
   approves exams, unpublishes. Student/parent: see published evaluations, running
   figures, walls hold. Then tag.

---

## 7. How to start
Resolve Q1–Q7 (recommendations in §2–§5). Q1 (what makes the subject total final with no
subject-publish) is the load-bearing one — it defines the whole engine change and Step 1
can't start without it. Approve §6. Step 1 reopens the grade engine — the diff must prove
the security wall, published-only visibility, and official-overall integrity, same rigor
as v0.7 step 1. Hold the freeze: five items, then tag. New discoveries → post-tag list.
After v0.7.4, the publish model is final and we move to Homework (v0.8) or whatever's next.
