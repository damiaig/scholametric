# ScholaMetric — SPEC v0.4 "Grades"

Goal: teachers enter scores; the system grades them against the school's scale,
computes per-subject and overall averages and end-of-term positions, and gates
big exams behind a review-and-publish flow before results become visible. This
is the data + entry + computation layer. The printable report-card DOCUMENT is
v0.5 — v0.4 makes results viewable in-app.

Builds directly on v0.3's plumbing: assessment_components (weights sum to 100),
grade_boundaries (score→grade), and subject_teacher_assignments (who teaches
what). Nothing here works without those.

Delivered when: a teacher opens one of THEIR assigned classes+subjects, enters
scores for a component in a bulk grid, sees them auto-graded (with manual
override available); CA-type components count immediately while exam-type
components require director/owner approval before the term result publishes;
published results show each student their per-subject grade, class average, and
end-of-term positions (per-subject and overall); and all §8 acceptance criteria
pass.

---

## 1. Domain model (v0.4 additions)

### assessment_components — add columns (v0.3 table)
- `requires_approval` boolean, default false. When true (e.g. "Exam"), scores
  for this component feed a term result that must be published by a
  director/owner before students/parents see it. When false (CA1, CA2), scores
  count immediately.
- `max_score` int, default 100. The raw ceiling a teacher enters against for
  this component (e.g. a CA marked out of 20 has max_score 20; the weight still
  governs its contribution to the 100-point total). Validated: 1–100.

Seed update: CA1 (weight 20, max_score 20, requires_approval false),
CA2 (20, 20, false), Exam (weight 60, max_score 100, requires_approval true).

**Resolution (review, pre-step-1):** `assessment_components.deleted_at` was
added but deliberately left unwired in v0.3 — see `docs/DECISIONS.md`
resolution 8: "turning it on ... is v0.4's job, once scores actually need
the protection." That's now. `student_scores.component_id` will FK to this
table, so `PUT /assessment-components`'s current hard delete-and-recreate
(every save nukes and rebuilds the whole set) must change once any score
references a component — otherwise the first post-scoring edit either
FK-violates or (if the FK is ever made CASCADE) silently deletes every
score for that component. Step 1 must: wire real soft-delete (removed
components get `deleted_at` set, not hard-deleted, once they have any
`student_scores` row referencing them — components with zero scores can
still be hard-deleted, matching today's behavior), migrate
`@@unique([school_id, name])` to a partial index (`WHERE deleted_at IS
NULL`) so a re-added component with the same name doesn't collide with a
soft-deleted one, and make `PUT /assessment-components`'s replace logic
match existing rows (by id, not just recreate-everything) so unchanged
components keep their id and referencing scores stay valid. Design this
explicitly in the step-1 plan — it's more than a column addition.

### student_scores (the core new table)
One row per (student, subject, component, term, session).
| column        | type    | notes                                              |
|---------------|---------|----------------------------------------------------|
| id            | uuid PK |                                                     |
| school_id     | uuid FK | NOT NULL, indexed (tenancy)                         |
| student_id    | uuid FK |                                                     |
| subject_id    | uuid FK |                                                     |
| component_id  | uuid FK | → assessment_components                             |
| session_id    | uuid FK |                                                     |
| term_id       | uuid FK |                                                     |
| class_arm_id  | uuid FK | denormalized for fast class-grid queries            |
| raw_score     | numeric | 0..component.max_score; nullable (not-yet-entered)  |
| entered_by    | uuid FK | → users (the teacher/admin who entered it)          |
| entered_at    | timestamptz |                                                 |
| created_at / updated_at | |                                              |

UNIQUE(student_id, subject_id, component_id, term_id, session_id).
Indexes: (school_id, class_arm_id, subject_id, term_id, session_id) for grid
loads; (school_id, student_id, term_id, session_id) for a student's results.
Every score write is audited. (Note: follow the existing precedent from
`PUT /assessment-components` / `PUT /grade-boundaries` — one manual
`audit_logs` row summarizing the whole bulk save, not one row per student
score; the standard `@Audit()`/`AuditInterceptor` doesn't fit an
array-bodied bulk endpoint. Same for `POST /grades/publish`/`unpublish`.)

### term_subject_results (computed, per student per subject per term)
Cached computation so results and positions don't recompute on every read.
| column          | type    | notes                                           |
|-----------------|---------|--------------------------------------------------|
| id, school_id, student_id, subject_id, session_id, term_id, class_arm_id      |
| total_score     | numeric | weighted sum across components, 0–100            |
| auto_grade      | text    | derived from grade_boundaries                    |
| override_grade  | text    | nullable; manual override by an authorized user  |
| final_grade     | text    | override_grade ?? auto_grade (stored for speed)  |
| subject_position| int     | rank within the class arm for this subject/term  |
| status          | enum    | DRAFT, PENDING_APPROVAL, PUBLISHED               |
| published_at    | timestamptz | nullable                                     |
| created_at / updated_at |                                                    |

UNIQUE(student_id, subject_id, term_id, session_id).

### term_overall_results (computed, per student per term)
| column          | type    | notes                                           |
|-----------------|---------|--------------------------------------------------|
| id, school_id, student_id, session_id, term_id, class_arm_id                  |
| average_score   | numeric | mean of subject totals (or weighted — see below) |
| average_grade   | text    | the average expressed as a letter grade          |
| overall_position| int     | rank within the class arm for the term           |
| subjects_count  | int     |                                                  |
| status          | enum    | DRAFT, PENDING_APPROVAL, PUBLISHED               |
| created_at / updated_at |                                                    |

UNIQUE(student_id, term_id, session_id).

Computation rules (make these explicit in code + DECISIONS.md):
- A subject's total = Σ over components of (raw_score / max_score × weight),
  giving a 0–100 total; only counts components that have scores.
  **Resolution (review, pre-step-1):** missing components contribute 0, NOT
  a rescale to the entered weight's own 100% — a class average shown while
  only CA1+CA2 (40% weight) are entered reads as "40-ish out of 100 so
  far," not "100." This is the simpler, more literal reading ("points
  earned so far out of 100") and avoids an average that visibly *drops*
  once Exam scores start landing, which would look like a bug. Same rule
  applies to the live class-average display in the entry grid (§4 item 1).
- final_grade = override_grade if set, else the grade_boundary band the total
  falls into.
- Class average per subject = mean of that class arm's students' subject totals,
  expressed BOTH as a number and as its grade band (shown to students/parents
  as a letter grade, per Dami's spec — Pronote-style comparison).
- subject_position: rank of the student's subject total within the class arm
  (ties share a position; the next rank skips — standard "1,2,2,4"). Computed
  at term end.
- overall_position: rank of average_score within the class arm.
- Positions are computed only for PUBLISHED results (a subject still pending
  approval doesn't leak a position early).

### Approval / publish model
- Components with requires_approval=false ("CA type") → their scores contribute
  immediately; a subject result whose approval-required components are all
  either absent or published is itself DRAFT→can be shown, BUT:
- A term_subject_result enters PENDING_APPROVAL once its exam (approval-required)
  component has scores for the class. A director/owner publishes it → PUBLISHED.
- A term_overall_result publishes when all its subject results are published.
- Publishing is per class arm per subject per term (bulk action), not per
  student — a director publishes "JSS 1 A English, First Term" in one action.

---

## 2. API (all /api/v1, tenant-scoped via JWT per CLAUDE.md §4)

### Roles for this version
Score ENTRY: TEACHER (only their assigned subject+arm, current session/term via
subject_teacher_assignments), and SCHOOL_ADMIN/PROPRIETOR (any). SUPER_ADMIN: no
access to school academic data (403), consistent with the codebase.
(Note: `subject_teacher_assignments` is scoped per SESSION, not per term —
no `term_id` column exists on it. "Current session/term" scoping means: the
teacher's subject+arm assignment is checked at the session level; term is
just which term's score-set they're entering within that assignment. No
schema change implied.)
REVIEW/PUBLISH: PROPRIETOR (the "owner", highest authority, can override grades
and unpublish) and SCHOOL_ADMIN acting as "director" (can review + publish, but
owner-only actions — force-unpublish after publish, grade override on a
published result — are PROPRIETOR-only).

**Resolution (review, pre-step-1):** the existing role set is sufficient —
no new role needed. `RolesGuard` already supports per-endpoint role lists
(`@Roles(...)` is a plain OR-list), so this is `@Roles(SCHOOL_ADMIN,
PROPRIETOR)` on entry/review/publish and `@Roles(PROPRIETOR)` alone on
unpublish + override-on-a-published-result. The one real gap: this is the
FIRST time `PROPRIETOR` and `SCHOOL_ADMIN` get different permissions
anywhere in this app — every existing check (`lib/roles.ts`'s
`isSchoolAdmin()`, frontend) treats them as fully interchangeable, and no
`isProprietor()`/owner-only helper exists yet, frontend or backend. Step 1
must add one (mirroring `isSchoolAdmin()`'s shape) rather than scatter raw
`role === "PROPRIETOR"` checks per call site. "Director"/"owner" here are
plain-English labels for the `SCHOOL_ADMIN`/`PROPRIETOR` *roles* — unrelated
to `JobTitle.DIRECTOR_PROPRIETOR` (a `staff_profiles` display title with no
permission effect). Nothing constrains a school to exactly one SCHOOL_ADMIN
or PROPRIETOR; "the director"/"the owner" means "any user holding that
role," not one designated person.

### Score entry
- `GET /grades/grid?classArmId=&subjectId=&componentId=&termId=` — returns the
  entry grid: the class arm's students (current session enrollment) each with
  their existing raw_score for this component (null if unentered), plus the
  component's max_score. Teacher may only request grids for their assignments;
  others 403; cross-tenant 404. Paginated only if a class exceeds ~150
  (otherwise return all — a class grid is one screen).
- `PUT /grades/grid` — bulk upsert: { classArmId, subjectId, componentId,
  termId, scores: [{ studentId, rawScore }] }. Validates each rawScore in
  0..max_score; partial saves allowed (save-as-you-go); idempotent; atomic per
  request. Re-triggers computation for affected students (see below). Audited.
  Blocked if the term_subject_result is already PUBLISHED (must unpublish first).

### Computation
- Recomputation is triggered by score writes: recompute the affected students'
  term_subject_result (total, auto_grade, final_grade) and mark status
  appropriately (DRAFT if no approval-required component scored yet;
  PENDING_APPROVAL once the exam component has scores). Positions and
  term_overall_results are recomputed for the whole class arm at publish time
  (and viewable as provisional to admins before publish).
- `POST /grades/recompute` (admin, optional manual trigger for a class
  arm/subject/term) — idempotent; useful after roster changes.

### Grade override
- `PUT /grades/override` — { termSubjectResultId, overrideGrade | null }.
  Sets/clears override_grade; final_grade recomputed. SCHOOL_ADMIN/PROPRIETOR;
  on a PUBLISHED result, PROPRIETOR only. Audited (records old→new).

### Review & publish
- `GET /grades/review?classArmId=&termId=&status=` — for director/owner: the
  class arm's subject results with status, per-subject class average, and how
  many students still have missing scores (a publish-readiness view).
- `POST /grades/publish` — { classArmId, subjectId, termId } → computes final
  positions for that subject across the arm, sets its term_subject_results to
  PUBLISHED, published_at=now. If all subjects for the arm+term are published,
  also computes overall positions and publishes the term_overall_results.
  SCHOOL_ADMIN or PROPRIETOR. Audited.
- `POST /grades/unpublish` — { classArmId, subjectId, termId } → back to
  PENDING_APPROVAL (to fix an error). PROPRIETOR only (owner authority).
  Audited.

### Viewing results
- `GET /students/:id/results?termId=&sessionId=` — a student's results for a
  term: per subject { total, finalGrade, classAverageGrade, subjectPosition (if
  published) }, plus overall { averageGrade, overallPosition }. Admin/owner see
  DRAFT/PENDING too (marked as such); a TEACHER sees results for their students;
  unpublished subjects are marked "not yet published" rather than hidden from
  staff. (STUDENT/PARENT roles that only see PUBLISHED come with v0.9 accounts —
  not built here, but the status field is ready.)
- `GET /classes/arms/:id/results?termId=` — class-wide results table for
  staff (positions, averages) — powers the future report-card generation.

All list/grid endpoints exclude soft-deleted/withdrawn students by default.

---

## 3. Seed additions (idempotent)
- Update the three components with max_score + requires_approval as above.
- Enter realistic scores for at least TWO subjects (e.g. Mathematics, English)
  across ALL of JSS 1 A's students and the ~100-student JSS 2 A, for First Term,
  across CA1/CA2/Exam — so the grid, computation, class averages, positions, and
  the publish flow all have real data to exercise (and so the 100-student grid
  is a genuine performance test bed).
- Leave JSS 1 A First Term Mathematics in PENDING_APPROVAL (exam scored, not
  published) and English PUBLISHED — so both states are demoable from seed.
- Hillcrest: a smaller slice (one subject, one class) for cross-tenant tests.

---

## 4. Web app changes

1. **Score entry grid** (teacher's primary new workflow). From a teacher's
   "My Classes" (v0.3) or an arm page: pick subject → component → term →
   **bulk grid**: one row per student (name, admission no.), a single score
   input per row, keyboard-friendly (Enter/Tab moves down the column),
   auto-save on blur/debounce with a per-row saved/saving/error indicator,
   a "X of N entered" progress header, and inline validation (0..max_score).
   MUST stay fast and usable on the 100-student JSS 2 A class, at 360px too
   (on mobile the grid becomes a tight vertical list, not a wide table).
   Shows the live class average as scores fill in.
2. **Grades overview for a class/subject** — the entered scores across
   components with computed totals, final grades, and a class-average row;
   admin/owner see status badges (Draft/Pending/Published).
3. **Review & publish screen** (director/owner) — per class arm + term, a list
   of subjects with status, class average, missing-score count, and a
   **Publish** action (ConfirmDialog: "This publishes JSS 1 A English First
   Term results — students' grades and positions become final"). Owner gets an
   **Unpublish** action on published results. A grade **override** control on a
   subject result (owner, or admin per the resolved rule), clearly marked as a
   manual override with the auto grade still shown.
4. **Student results view** (in the existing student detail page, a "Results"
   tab): per-term, per-subject grade + class-average grade + position, plus
   overall average grade + position. Unpublished subjects show "pending" to
   staff. This is the in-app precursor to the v0.5 printable report card.
5. **RBAC in UI:** teachers see entry grids only for their assignments and no
   publish/override controls; SCHOOL_ADMIN sees entry + review + publish;
   PROPRIETOR additionally sees unpublish + published-grade override.
6. All states (loading/empty/error), tokens per CLAUDE.md §6, 360/768/1280.

---

## 5. Non-functional
- The 100-student grid load and bulk-save must feel instant locally
  (single query load, single-transaction save); verify no N+1 and that
  positions/averages computations are set-based SQL, not per-student loops.
- Recomputation must be correct under concurrent entry (two teachers can't
  corrupt a class's results); use transactions and the same advisory-lock
  discipline used for admission numbers where a race is possible.
- Never leak an unpublished position to a non-staff caller (the status gate).

---

## 6. Explicitly out of scope (queued as their own versions — do not build)
Printable report-card document (v0.5) · homework (v0.6) · school calendar
(v0.7) · resources/file uploads (v0.8) · messaging + parent/student login
portal (v0.9) · fees/bursar · attendance · promotion/re-enrollment · WAEC
registration. Also: per-level assessment schemes, weighting overall average by
subject, and configurable position tie-breaking — note as future refinements,
keep v0.4's rules simple and documented.

---

## 7. Build order (one Claude Code session per step)
1. Schema + migration (component columns, student_scores,
   term_subject_results, term_overall_results, enums) + seed additions.
   Resolve the director-vs-owner permission model here (role or permission
   flag) and flag if the role set needs extending. Prove seed correctness with
   query output (a student's weighted total computed by hand vs stored).
2. Score-entry API (grid GET, bulk PUT with validation + teacher scoping) +
   the computation engine (totals, auto grade, status transitions) + e2e
   incl. teacher-scope 403s, cross-tenant 404s, concurrent-entry safety,
   published-lock.
3. Review/publish/override/unpublish API + position computation (per-subject
   + overall, tie handling) + results-viewing endpoints + full e2e incl. the
   status gate (no early position leaks) and the owner-vs-director split.
4. Web: the bulk score-entry grid (the big one — 100-student performance,
   keyboard nav, auto-save, 360px). Manual verify against JSS 2 A.
5. Web: grades overview + review/publish/override screens + student Results
   tab. Manual verify the full teacher→director→published→student-visible flow.
6. Acceptance + polish on a fresh stack; walk §8; tag v0.4.0.

---

## 8. Acceptance criteria
- [ ] Fresh down -v → up → migrate → seed; ALL v0.1+v0.2+v0.3 criteria still
      pass (regression).
- [ ] A teacher can enter scores ONLY for their assigned subject+arm; entry for
      an unassigned class → 403; the grid loads fast for the 100-student class.
- [ ] Bulk save is partial-safe and idempotent; a rawScore above max_score is
      rejected; re-entering updates cleanly.
- [ ] A weighted total matches a hand-computed example (CA1 18/20, CA2 16/20,
      Exam 55/100 → 18/20·20 + 16/20·20 + 55/100·60 = 18+16+33 = 67 → grade per
      WAEC scale).
- [ ] Auto grade matches the school scale; a manual override changes final_grade
      while the auto grade remains visible; override is audited.
- [ ] CA-only scores count immediately; an exam-component score puts the subject
      result into PENDING_APPROVAL; it is NOT visible as published until a
      director/owner publishes.
- [ ] Publishing a subject computes correct per-subject positions (verify a tie
      shares a rank); publishing all subjects computes overall positions.
- [ ] An unpublished subject leaks NO position to a non-staff query path
      (status gate holds).
- [ ] PROPRIETOR can unpublish; SCHOOL_ADMIN cannot; a published-result grade
      override is PROPRIETOR-only.
- [ ] Cross-tenant: Hillcrest staff cannot read/enter/publish any Sunrise
      scores or results (404).
- [ ] Full ci green; GitHub Actions green on the tag; every new page usable at
      360px.
