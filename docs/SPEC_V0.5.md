# SPEC_V0.5 — "Report Cards" (close out a term properly)

**Status:** DRAFT for approval. No code until §7 build order is approved.
**Depends on:** v0.4.0 (Grades) — score entry, two-tier assessment,
publish/override, per-subject + overall positions, grades overview / review /
student Results tab.

---

## 1. Theme

One theme, tightly scoped: **close out a term properly.** Everything in this
version is an end-of-term concern that renders or depends on the others —
absent handling, the completeness gate, the term open/closed lifecycle, and the
printable report card that shows it all. They are specced together because
splitting them means designing each half-blind (e.g. "how does absent behave" is
unanswerable without "how does absent print").

Out of scope (do NOT add — these are later versions): homework (v0.6), calendar
(v0.7), file uploads / Firebase (v0.8), messaging / parent logins (v0.9), fees,
attendance, promotion.

---

## 2. Scope — the four pillars (decisions already made are marked DECIDED)

### 2.1 Absent as a first-class score state
- A **teacher enters "absent" directly in the score-entry grid cell**, as an
  alternative to typing a number (same cell, same keyboard-first flow as v0.4).
- **DECIDED — absent does not count.** It contributes **nothing** to the subject
  total: not a 0, not a rescale. A student who was absent for a component has an
  honestly lower total over the components they actually sat.
- **DECIDED — prints "Abs"** on the report card and in the Results tab where the
  number would be.
- Absent is distinct from three other states already in play: *empty/not-yet-
  entered* (which today counts as 0 in the total — unchanged for genuinely
  un-entered), *a real 0* (sat it, scored nothing), and *published/locked*.

**Open questions for your call (see §5):**
- Q1. Is an absent-in-one-component student still **ranked** for that subject?
- Q2. Does an absent component change the **denominator** of the class average
  for that component?

### 2.2 Completeness gate
- A component (test/exam) **cannot be finalized/published** until **every student
  in the roster has either a score or an explicit absent mark** — no silent
  blanks that quietly become 0.
- The gate surfaces **who is still blank** so the teacher/director can resolve it
  before publishing.
- Depends on 2.1 (absent must exist first).

### 2.3 Term lifecycle + editability (the Pronote model)
- **DECIDED reconciliation of publish-state vs term-state:**
  - **publish** = "final & visible to parents" (unchanged from v0.4) — a
    visibility/finality act, NOT a teacher edit-lock.
  - **current term open** = a teacher may **edit their scores freely, anytime**,
    including after publishing; an edit recomputes total/grade/position and
    re-publishes the corrected number.
  - **term close** = a deliberate act by **principal/proprietor** (end of term,
    when report cards go out) that flips the term to **read-only**.
  - **editing a closed term's scores requires principal clearance** — an
    unlock → edit → record flow.
- This introduces a **term open/closed state** and a **principal unlock-for-
  editing flow**, which v0.4 did not have (v0.4 has publish-state only).

**Open questions for your call (see §5):**
- Q3. What is the unlock granularity — unlock the whole closed term, or a single
  class-arm+subject within it? And is unlock time-boxed (auto-re-locks) or a
  manual re-lock?
- Q4. Does closing a term require all results to be published first (a natural
  "you can't close with unfinished grading" guard), or can a term close with
  DRAFT results left behind?

### 2.4 Printable term report card
- A **printable per-student term report card** showing: each subject's **CA + exam
  breakdown**, subject total, final grade, subject position; the student's
  **overall average grade and overall position**; **teacher remark** and
  **principal remark**; and **"Abs"** wherever a component was missed.
- Renders everything from 2.1–2.3.

**Open questions for your call (see §5):**
- Q5. Render approach: **client-side print** (a print-styled HTML view →
  browser Print/Save-as-PDF) vs **server-side PDF generation**. File storage
  (Firebase) is not until v0.8, so neither should persist a PDF to storage yet —
  this is about generating the document on demand.
- Q6. Where do remarks come from — free-text entered per student by the class
  teacher (remark) and principal (remark), stored per student+term? (Assumed
  yes; confirm the two-remark model and who writes which.)

---

## 3. Fold in the deferred v0.4 gaps (where they naturally fit)

- **Gap 1 — zero-approval-component lockout.** A school with no
  `requires_approval` component can never leave DRAFT. Fix here (this version is
  about finalizing a term, so it's the right home): **require at least one
  approval component** in the assessment structure, OR provide an explicit
  **publish-from-DRAFT** path. Pick one in the plan.
- **Gap 2 twin — `POST /grades/recompute`.** Carries the same stale-overall
  latent gap `saveGrid` was fixed for in v0.4. Apply the same conditional
  class-arm-lock + overall-recompute fix.

(Gap 3 — `students.service findOne` teacher-scoping — is NOT in this theme; leave
it, or address separately if it blocks the report-card access model.)

---

## 4. Data model additions (anticipated — confirm in step 1)

- **Absent:** a per-`student_score` state. Likely a nullable `is_absent boolean`
  (or a score-status enum) so a row can be "absent" distinct from a null/0
  rawScore. The pure computation module must treat absent as **excluded from the
  weighted total**, not zero.
- **Term lifecycle:** a `status`/`closed_at` on the term (or a dedicated
  term-close record), plus an **unlock/clearance** record capturing who unlocked
  what, when, and (ideally) why — for audit.
- **Remarks:** a per-student-per-term record holding teacher remark + principal
  remark (and who set each, when).

All new tables carry `school_id` and are JWT-scoped; cross-tenant → 404; e2e on
every new module (CLAUDE.md rule, non-negotiable).

---

## 5. Open questions — need your call before/at step 1

| # | Question | My recommendation |
|---|----------|-------------------|
| Q1 | Absent student still ranked for that subject? | **Yes** — rank them among those who sat, using their honest (lower) total; show their position normally. Absent isn't a withdrawal, just a lower score-set. |
| Q2 | Absent changes the class-average denominator? | **Yes** — an absent student is excluded from that component's class-average denominator (averaging over who actually sat), same "excluded, not zero" principle as their own total. |
| Q3 | Unlock granularity + re-lock | **Per class-arm+subject within the closed term** (not the whole term), **manual re-lock** by the principal. Minimizes blast radius; the principal explicitly closes the door again. |
| Q4 | Can a term close with DRAFT results? | **Warn but allow**, listing what's still unpublished — closing is the principal's call, and forcing 100% published could trap them if one subject is legitimately incomplete. |
| Q5 | Report-card render approach | **Client-side print** (print-styled HTML, browser Print/Save-as-PDF) for v0.5 — no new heavy dependency, no storage needed, works on cheap hardware. Revisit server-side PDF when batch printing / archiving is a real need (post-pilot). |
| Q6 | Remarks model | **Two free-text remarks per student+term:** class teacher writes the teacher remark, principal writes the principal remark. Confirm. |
| Q7 | Gap-1 fix shape | **Require ≥1 approval component** in the assessment structure (simpler, prevents the un-publishable state at the source) rather than a publish-from-DRAFT path. Confirm. |

---

## 6. Acceptance criteria (proven live on a fresh stack at version end)

1. A teacher marks a student **absent** in the grid; that student's subject total
   is computed over only the components they sat (absent contributes nothing);
   "Abs" shows in the Results tab and on the report card.
2. A component **cannot be published** while any roster student is neither scored
   nor marked absent; the UI names who's blank; once resolved, publish succeeds.
3. While the term is **open**, a teacher edits a previously-published score; it
   recomputes and re-publishes the corrected total/grade/position.
4. A principal/proprietor **closes the term**; the teacher can no longer edit;
   an attempt surfaces the "needs clearance" path.
5. A principal **unlocks** a closed class-arm+subject, an edit is made and
   recorded, and the principal re-locks.
6. A **report card** for a real student renders CA+exam per subject, totals,
   grades, positions, overall average grade + position, both remarks, and "Abs"
   where applicable — printable to PDF.
7. The zero-approval-component lockout is prevented (per Q7).
8. `POST /grades/recompute` no longer strands a stale overall (gap-2 twin fixed).
9. Cross-tenant isolation holds on every new endpoint (404 both directions).
10. Full suite green on a fresh DB; typecheck + lint clean.

---

## 7. Build order (numbered steps — each = one Claude Code session, plan → build → PROVE → commit → push → chat reviews the diff)

*Proposed — adjust after the Q1–Q7 answers land. Absent is foundational (the
gate and the report card both depend on it), so it goes first.*

1. **Schema + computation + seed.** Add absent state, term-close/unlock records,
   remarks table. Update the pure computation module so absent is excluded from
   the weighted total (with a hand-verified example, v0.4-style). Seed realistic
   absent cases + a closed term. No API/UI yet.
2. **Absent API + completeness gate.** Score-entry accepts absent; publish/
   finalize enforces the completeness gate (score-or-absent for all); gap-1 fix
   (Q7). e2e: absent-excluded-from-total, gate blocks-then-allows.
3. **Term lifecycle API.** Close-term, unlock (principal clearance), re-lock;
   the "current-term-open = teacher edits freely, closed = needs clearance"
   enforcement; gap-2-twin recompute fix. e2e: edit-open-ok, edit-closed-403,
   unlock→edit→relock, RBAC + cross-tenant.
4. **Report-card read endpoint + remarks API.** The per-student term data the
   card needs (reusing v0.4 aggregation), plus write/read of the two remarks.
   e2e: correct assembly incl. "Abs", remarks round-trip.
5. **Web — absent in the grid + completeness-gate UI + term-close/unlock UI.**
   Grid cell accepts absent; gate shows who's blank; principal close/unlock
   controls (owner/principal only, absent-not-disabled for others).
6. **Web — the printable report card + remarks entry.** Print-styled per-student
   card (Q5), teacher/principal remark entry. Vitest + live-stack walk.
7. **Acceptance + tag v0.5.0.** Fresh-stack down -v → rebuild → migrate → seed →
   live walk of every §6 criterion; Mrs. Nwachukwu pass; tag.

---

## 8. How to start

Resolve Q1–Q7 (recommendations in §5), then approve §7. Step 1's Claude Code
prompt is plan-first, same loop as every v0.4 step. Hold the line on scope — this
version is "close out a term," nothing more.
