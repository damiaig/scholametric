# SPEC_V0.7.3 — "Teacher-Owned Publish + Live Class Average"

**Status:** DRAFT for approval. No code until §4 build order is approved.
**Depends on:** v0.7.2 (Pronote Flow) — built, tag pending.
**Origin:** Dami's walk of v0.7.2. Two Pronote-alignment gaps: (A) the running
average shows the student's own figure but not a live CLASS average beside it; (B)
publishing requires an ADMIN — a teacher can't make their own graded work visible.
Pronote has no admin-approval bottleneck: the teacher decides when their subject is
visible. A full removal of the publish concept was diagnosed as LARGE (publish is a
single overloaded status column fused into visibility, edit-lock, ranking, overall,
and completeness across two duplicated engines). This version does the smart, small
version instead: keep publish, hand the button to the teacher, and add the live class
average.

**Frozen scope — exactly two items, nothing added after this:**
- **A.** Running / provisional **class** average, shown to the student beside their own
  running average, computed over published subjects so far (keeps calculating).
- **B.** Teachers can **publish and unpublish their own subjects** — no admin approval
  needed. (Admins/proprietors keep publish/unpublish too.)

Anything new at the acceptance walk → POST-TAG list, not this cycle.

---

## 1. Theme

One theme: **give the teacher control of publish, and show the class average live** —
closing the two remaining gaps between the current flow and the Pronote feel, WITHOUT
removing the publish concept (which the diagnostic proved is fused into the engine and
would be a multi-step rebuild touching the security-adjacent code).

**What this does NOT do:** it does NOT remove publish, does NOT make grades visible on
keystroke (a teacher still publishes deliberately, so a typo is caught before it's
live), does NOT touch the cross-tenant / own-child security wall (confirmed separate
from publish in the diagnostic — it stays exactly as-is), does NOT change the running
AVERAGE math from v0.7.2.

---

## 2. Item B — teacher-owned publish/unpublish

**Today:** `publish()` / `unpublish()` are gated to `SCHOOL_ADMIN` / `PROPRIETOR`.
A teacher enters scores but cannot make them visible — they wait for an admin.

**Change:** a **TEACHER** can `publish` and `unpublish` a subject **they are assigned
to** (same teacher-scoping as score entry — `assertTeacherAssignment`). Admins and
proprietors keep the ability too. No admin approval step in between.

**What STAYS (the safety that isn't a bottleneck):**
- **The completeness gate stays.** A subject can only be published when every student
  has a score-or-absent on every evaluation (the existing `findIncompleteEntries`
  check). This is NOT admin gatekeeping — it's "don't publish half-graded results,"
  and it's exactly what catches "I forgot to grade 3 students." A teacher publishing
  their own subject still passes this gate. (Confirm — my strong recommendation is it
  stays.)
- **The edit-lock stays.** Once published, the row is locked to further teacher edits
  until unpublished (a teacher unpublishes their own subject to fix, then re-publishes)
  — this is what stops a "final, already-seen" number moving silently under a student.
- **Ranking/overall/exam cascades** are unchanged — publishing still computes positions
  and the overall exactly as today; only WHO may trigger it changes.
- **Term-close lock stays.** A closed term still requires the principal unlock flow
  before any edit/publish — teacher self-publish does NOT bypass a closed term.

**Flagged (Q1) — teacher unpublish scope.** A teacher can unpublish their OWN subject
(to correct it). Recommendation: yes — a teacher who can publish must be able to
unpublish their own subject, else they publish a typo and must beg an admin. Confirm.

**Flagged (Q2) — the admin Review & Publish workflow.** The admin Review & Publish page
still exists and still works (admins retain publish/unpublish for oversight/correction).
It is NOT removed — it becomes the ADMIN's view of publish state, not the only path to
publish. The teacher publishes from their own Grades page (the Results tab or a publish
control on the Enter-scores flow). Confirm the admin page stays as-is (oversight), and
the teacher gets a publish/unpublish control in their Grades-page flow.

**Scope note:** this is primarily a PERMISSION + BUTTON change — extend the role check
on `publish`/`unpublish` (and their exam equivalents) to include TEACHER-when-assigned,
and surface the publish/unpublish control in the teacher's Grades-page Results/Enter-
scores UI. It does NOT rewrite the publish engine, the completeness gate, the ranking,
or the walls — those run identically, just reachable by an assigned teacher. e2e must
prove: an assigned teacher can publish/unpublish their own subject; a teacher CANNOT
publish a subject they don't teach (403); the completeness gate still blocks an
incomplete publish for a teacher; a closed term still blocks teacher publish; admin
publish/unpublish unchanged.

---

## 3. Item A — running / provisional class average (shown to the student)

**Today:** the student sees their OWN running average ("your average so far", v0.7.2).
The official CLASS average (`generalClassAverage`, nested in `overall`) only exists once
the whole term is published (null mid-term). So there's no live class figure beside the
student's live figure.

**Change:** add a **running class average** — the class's average across published
subjects so far — shown beside the student's running average, updating as subjects
publish. Additive, on-read, published-only, anonymous (a number, no names).

**Flagged (Q3) — computation, mirroring v0.7.2's running average.** Recommendation:
compute on-read as a new additive field (e.g. `runningClassAverageScore`), NOT nested
in `overall` (same independence-signal as `runningAverageScore`). It is the mean of the
class's published subject figures so far — computed over PUBLISHED rows only (an
unpublished subject/classmate contributes nothing — same wall as every class figure in
v0.7). Confirm on-read additive, not a cached field.

**Flagged (Q4) — the anonymity + published-only guarantee.** The running class average
is a class-level aggregate shown to a student/parent, so it MUST be published-only
(never include an unpublished subject or classmate) and structurally anonymous (returns
a number, never a name/id). Reuse the exact eligibility mechanism v0.7 step 5 already
proved (the published-student allow-list feeding a pure numbers-in-numbers-out helper).
Confirm reuse, not a new path. e2e: the running class average is correct over published
data; an unpublished subject/classmate does NOT move it; JSON.stringify shows no
classmate name/id leaks.

**Display:** the student/parent Grades-page summary strip (and optionally the dashboard)
shows "Your average so far" beside "Class average so far" — both live, both /100. This
is the companion figure deferred from v0.7.2 step 3, now built.

---

## 4. Build order (numbered — each = one Claude Code session: plan → approve → build → PROVE → commit → push → chat reviews the diff)

1. **Item B — teacher-owned publish/unpublish.** Extend the role check on publish/
   unpublish (grades + exams) to TEACHER-when-assigned; surface the publish/unpublish
   control in the teacher's Grades-page flow. Completeness gate, edit-lock, ranking,
   term-close lock, and the walls all UNCHANGED — only who may trigger publish changes.
   e2e per §2. This touches the backend (a role check) but NOT the engine logic — the
   diff must prove the completeness gate / ranking / walls are byte-for-byte unchanged,
   only the authorization widened.
2. **Item A — running class average.** Additive on-read `runningClassAverageScore`,
   published-only, anonymous, reusing the v0.7 step-5 eligibility mechanism. Wire into
   the Grades-page summary strip beside the student's running average. e2e per §3
   (correct value, unpublished-excluded, anonymity stringify check).
3. **Acceptance walk + tag v0.7.3.** Teacher hat: enter grades → publish own subject
   (no admin) → unpublish to fix → re-publish; confirm completeness gate still blocks
   incomplete; confirm can't publish a non-taught subject. Student/parent hat: running
   average AND running class average both showing, live, /100, anonymous. Then tag.

---

## 5. How to start
Resolve Q1–Q4 (recommendations in §2–§3), approve §4. Step 1 (teacher publish) is a
backend authorization change — the diff must prove the engine/gate/walls are unchanged
and only the role check widened. Step 2 (class average) is additive on-read, reusing
the proven published-only + anonymity mechanism. Hold the freeze: two items, then tag.
New discoveries at the walk → post-tag list. After v0.7.3 tags, v0.7 is fully closed
and we move to v0.8.
