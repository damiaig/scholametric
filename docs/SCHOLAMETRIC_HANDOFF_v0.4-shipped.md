# ScholaMetric — Project Handoff Brief

**Purpose:** Paste this at the start of any new chat to continue the project with
zero context loss. Captures where things stand, how we work, and every decision
and future feature promised so far.

**Last updated:** after v0.4.0 "Grades" shipped; v0.5 "Report Cards" scoped, not
yet started.

---

## What this is

A multi-tenant school management platform for Nigerian schools, built by Dami
with Claude Code (agentic coding tool) doing implementation and Claude (chat) as
tech lead / spec author / reviewer. Vision: a Pronote-class platform serving many
schools; strategy is to perfect it for one pilot school first.

**Repo:** https://github.com/damiaig/scholametric (private)
**Machine:** Apple Silicon Mac (M-series). Node 22 (via nvm), pnpm 11.18.0,
Docker Desktop (Apple Silicon). Stack: `docker compose up -d`; health at
http://localhost:3000/health, web at http://localhost:5173.
NOTE: port 3000 sometimes clashes with Dami's other Next.js project; if
`docker compose up` fails with "port 3000 in use", run `lsof -i :3000` then
`kill -9 <PID>`.

**Seed logins (all password `Passw0rd!`):** admin@sunrise.test (SCHOOL_ADMIN),
proprietor@sunrise.test (PROPRIETOR), teacher@sunrise.test (TEACHER),
newteacher@sunrise.test (forced password change), admin@hillcrest.test (second
school, cross-tenant tests), super@scholametric.test (SUPER_ADMIN).

---

## Tech stack (fixed — CLAUDE.md §2)

TypeScript strict · NestJS 10 (REST) · Prisma + PostgreSQL 16 · Redis 7 ·
React 18 + Vite · Tailwind + shadcn/ui + Lucide · TanStack Query · JWT auth
(access 15m/refresh 7d, rotation + reuse detection) · Zod + class-validator ·
Vitest (web) + Jest/Supertest (api) · Docker Compose · react-router-dom ·
recharts · GitHub Actions CI.
Do NOT upgrade Prisma to 7 (stay 6.x). Do NOT touch pnpm off 11.18.0 (11.12.0
is a known-broken release). No Firebase yet — Firebase Storage arrives in v0.8
(the first file-upload feature).

---

## How we work (the method)

- Spec-first, ONE theme per version. Each version gets SPEC_Vx.x.md in docs/
  before any code.
- CLAUDE.md is the constitution — read every Claude Code session, never violated.
  Key rule: multi-tenancy — every table has school_id, scoped via JWT only;
  cross-tenant access returns 404 (not 403), enforced by e2e on every module.
- Build order: each spec has numbered steps; each step = one Claude Code session
  ending in green build + commit. Steps: schema → API → CI → frontend → acceptance → tag.
- Every step: plan first → approve → build → PROVE IT (real e2e + live stack,
  not just typecheck) → commit → push → Claude chat reviews the diff.
- Every version ends with a fresh-stack acceptance run (docker compose down -v →
  rebuild → migrate → seed → live walk of all criteria) then tag vX.X.0.
- DECISIONS.md append-only (design choices + bugs, dated). Push after every commit.
- Dami does a human "Mrs. Nwachukwu" test pass after each version (plays a school
  admin/proprietor, notes friction) — has produced the best features.
- Migration rule: Prisma migrations use --create-only then hand-review SQL before
  applying (auto-diff tries to DROP hand-written trigram/partial-unique indexes).
- Live-stack proof for web is done via a scratchpad-only chromium-cli walk this
  session, NOT a committed Playwright suite (Playwright is not in the fixed stack;
  a permanent browser-e2e layer is a deferred, deliberate future decision).

---

## Progress

**v0.1 "Foundation" (v0.1.0)** — auth, multi-tenant schools, students,
sessions/terms/class-levels/arms, web shell + school-picker login, students CRUD,
dashboard, settings.

**v0.2 "Staff & Structure" (v0.2.0)** — Teachers section, Personnel (roles vs
job-titles), PROPRIETOR role, Classes (levels-first + add-arm), Subjects mapped
to levels, multiple guardians + sibling linking, audit trail, session-activation
safety, editable school profile.

**v0.3 "The Teacher's School" (v0.3.0)** — teacher home ("My Classes"),
assessment-structure panel (weights sum to 100), grading-scale panel (WAEC
9-point + A-F presets), forced password change on first login, removed old
/users endpoints, GitHub Actions CI.

**v0.4 "Grades" (v0.4.0) — SHIPPED.** Tagged and pushed after a clean Mrs.
Nwachukwu proprietor pass. All 6 steps built, each plan→build→prove→reviewed.
- Bulk score-entry grid: teacher-scoped, keyboard-first, save-as-you-go, handles
  100+ students, survives connection drop (proven on the real ~102-student
  JSS 2 A class).
- Two-tier assessment via a per-component `requires_approval` flag: non-approval
  components (CAs/quizzes/tests) count immediately; approval-required ones (the
  exam) sit PENDING until published.
- publish / unpublish / override: publish = SCHOOL_ADMIN or PROPRIETOR; unpublish
  and override-a-published-grade = PROPRIETOR only; override 409-blocked while
  DRAFT.
- Per-subject AND overall positions (standard-competition "1,2,2,4" ranking;
  strict partial-term exclusion — a student is ranked overall only once every
  subject they hold is published).
- Grades overview (per-subject + class averages shown as LETTER GRADES,
  Pronote-style), review/publish UI, student Results tab.
- Concurrency: two advisory locks (per-subject key, then broader class-arm key
  for the overall-recompute phase), fixed subject-then-arm acquisition order, no
  deadlock. Computation: subject total = Σ(raw/max × weight); missing = 0;
  final = override ?? auto.
- Key commits: step2 `0522e94`, step3 `d625d43`, step4 `b9f8811`/`fc3b1a0`,
  step5 `19fd3a3`, gap-#2 fix `af94921`.

---

## v0.4 known gaps (documented, deliberately deferred to v0.5)

1. A school with ZERO `requires_approval` components can never leave DRAFT
   (results unpublishable/un-overridable forever). Fix in v0.5: require ≥1
   approval component, or add a publish-from-draft path.
2. `saveGrid` is fixed for the stale-overall case (gap #2, `af94921`), but
   `POST /grades/recompute` carries the identical latent gap — flagged, not
   fixed.
3. `students.service.ts findOne` has no teacher-scoping — any teacher can view
   any student's profile page. The Results tab handles this by 403-ing
   gracefully in-tab. Tightening findOne is a separate future decision.

**Config note (not code):** approval is per-component. A real school should mark
ONLY the exam as `requires_approval` and leave quizzes/tests/CAs off (they go
final on entry) — but never zero approval components (gap 1 above).

---

## v0.5 "Report Cards" — SCOPED, NOT STARTED

One coherent version = "close out a term properly." Write SPEC_V0.5.md first.
Headline scope, with the design decisions Dami has already made:

1. **Absent as a first-class score state.**
   - Teacher enters "absent" directly in the score-entry grid cell, as an
     alternative to typing a number.
   - Absent DOES NOT COUNT: it contributes nothing to the total — NOT a 0, NOT
     rescaled. The student's subject total is honestly computed over what they
     actually sat.
   - Prints as "Abs" on the report card where the number would be.
   - Open design questions to resolve in the spec: is an absent student still
     ranked (per-subject / overall)? How exactly does the denominator behave?

2. **Completeness gate.** A test/exam can't be finalized (published) until every
   student in the roster has EITHER a score OR an explicit absent mark — no
   silent blanks becoming 0.

3. **Term lifecycle + editability (the Pronote model Dami chose).**
   - Reconciliation confirmed: **publish** = final & visible (to parents / on the
     report card); **current-term-open** = teacher can still edit freely;
     **term-close** = now needs principal clearance.
   - While a term is OPEN, a teacher edits their scores freely anytime — even
     after publishing — and totals/grades/positions recompute (re-publishing with
     the corrected number).
   - Editing a PAST/CLOSED term's scores requires PRINCIPAL clearance (an
     unlock-edit-record flow).
   - This adds a NEW concept v0.4 lacks: term open/closed state + a principal
     unlock-for-editing flow.

4. **Printable term report card** — the deliverable: CA + exam per subject,
   totals, grades, positions, teacher/principal remarks. Renders everything
   above. (Note: file storage isn't until v0.8, so consider print/PDF approach
   that doesn't require server-side file storage — likely client-side print or
   generated-on-demand.)

5. **Fold in the deferred v0.4 gaps** (the zero-approval-component lockout; decide
   on the `recompute()` twin gap).

Build absent + gate + term-lifecycle TOGETHER WITH the report card, because the
display / denominator / ranking questions all overlap — speccing them apart means
guessing at report-card decisions and redoing them.

---

## Future roadmap (PROMISED — do not forget)

- v0.6 Homework.
- v0.7 School Calendar — school days, holidays, "no class this week", due dates.
- v0.8 Resources — teachers upload lessons/notes per class/subject. NEEDS FILE
  STORAGE (Firebase Storage; first file-upload feature).
- v0.9 Messaging + Parent accounts — Pronote-style portal (teacher↔student msgs,
  announcements, parent logins linked to children). Parent password distribution
  is a real problem (slips/SMS).
- Super-admin control panel — web UI for SUPER_ADMIN to see/add/suspend all
  schools (currently API-only).
- Fees / Bursar — #1 real-world demand; likely jumps the queue after a real school.
- Attendance — fast for big classes.
- Promotion / re-enrollment — move students between sessions, graduate SSS 3.
- WAEC/NECO registration — real external exam registration (NOT the grading scale).
- Deployment / production hardening — VPS, HTTPS, tested backups, monitoring.
  Design for Nigerian realities (2G, Android, cheap hosting).

Role hierarchy (titles = JobTitle enum + coarse permission roles, NOT 12 levels):
Director/Proprietor → Principal → Vice Principal → Admin staff (Registrar, Exam
Officer, Bursar, Secretary, ICT Admin, Nurse, Counselor) → Teachers → Parents →
Students.

Account model: SUPER_ADMIN = platform owner (Dami), creates schools, does NOT see
inside a school's data (403). PROPRIETOR = a school's owner, sees only their
school. Nigerian classes large (avg 51, up to 101+) — class UIs must handle 100+.

---

## Standing strategic advice

Highest-value next move is NOT necessarily more versions — it's showing the
current build to ONE real Nigerian proprietor/head teacher for 30 min and letting
their reaction drive the roadmap. This is louder now that v0.4 is shipped: the
teacher-enters-scores + director-publishes flow is the demo a proprietor
recognizes as THEIR school. Fees likely jumps the queue after a real school sees
it. No pilot school named yet — open recommendation.

---

## How to resume

Paste this brief, then say where you are (e.g. "v0.4 shipped, ready to spec
v0.5"). Claude should confirm context, then — for v0.5 — help write SPEC_V0.5.md
(theme: Report Cards + absent + completeness gate + term lifecycle), resolving
the open design questions, before any Claude Code build step. Always:
plan → approve → build → prove → commit → push → chat reviews the diff. Keep
versions tight. Don't forget the roadmap.
