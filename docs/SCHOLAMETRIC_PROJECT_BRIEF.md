# ScholaMetric — Project Handoff Brief

**Purpose:** Paste this at the start of any new chat to continue the project with
zero context loss. It captures where things stand, how we work, and every
decision and future feature promised so far.

---

## What this is

A multi-tenant school management platform for Nigerian schools, built by Dami
with Claude Code (agentic coding tool) doing the implementation and Claude (chat)
acting as tech lead / spec author / reviewer. The vision is a Pronote-class
platform serving many schools; strategy is to perfect it for one pilot school first.

**Repo:** https://github.com/damiaig/scholametric (private)
**Machine:** Apple Silicon Mac (M-series). Node 22 (via nvm), pnpm 11.18.0,
Docker Desktop (Apple Silicon build). Stack runs via `docker compose up -d`;
health at http://localhost:3000/health, web at http://localhost:5173.

**Seed logins (all password `Passw0rd!`):** admin@sunrise.test (SCHOOL_ADMIN),
proprietor@sunrise.test (PROPRIETOR), teacher@sunrise.test (TEACHER),
newteacher@sunrise.test (forced password change), admin@hillcrest.test
(second school, for cross-tenant tests), super@scholametric.test (SUPER_ADMIN).

---

## Tech stack (fixed — in CLAUDE.md §2)

TypeScript strict everywhere · NestJS 10 (REST) · Prisma + PostgreSQL 16 ·
Redis 7 · React 18 + Vite · Tailwind + shadcn/ui + Lucide · TanStack Query ·
JWT auth (access 15m / refresh 7d, rotation + reuse detection) · Zod +
class-validator · Vitest (web) + Jest/Supertest (api) · Docker Compose ·
react-router-dom · recharts · GitHub Actions CI.
Do NOT upgrade Prisma to 7 (stay 6.x). Do NOT upgrade pnpm off 11.18.0.

---

## How we work (the method — this is what keeps it shippable)

- **Spec-first, one theme per version.** Each version (v0.1, v0.2...) gets a
  SPEC_Vx.x.md in docs/ before any code. The version does ONE thing well.
- **CLAUDE.md is the constitution** — read every Claude Code session, never
  violated. Key rule: **multi-tenancy** — every table has school_id, scoped
  via the JWT only; cross-tenant access returns 404 (not 403), enforced by
  e2e tests on every module.
- **Build order:** each version's spec has a numbered step list; each step =
  one Claude Code session ending in a green build + a commit. Steps go
  schema → API → CI → frontend pages → acceptance run → tag.
- **Every step:** plan first → approve → build → PROVE IT (real e2e + live
  stack, not just typecheck) → commit → push → (I review).
- **Every version ends** with a fresh-stack acceptance run (`docker compose
  down -v` → rebuild → migrate → seed → walk every acceptance criterion via
  Playwright) then an annotated git tag vX.X.0.
- **DECISIONS.md is append-only** — records every design choice + bug, dated.
- **Dami does a human "Mrs. Nwachukwu" test pass** after each version —
  playing a school admin, clicking everything, noting friction. This has
  produced the best features (the whole sidebar redesign, teacher home, etc.).
- **Push after every commit.** (A near-miss during the machine migration
  taught this.)

---

## Progress so far

**v0.1 "Foundation" (tagged v0.1.0)** — auth, multi-tenant schools, students,
sessions/terms/class-levels/arms, the web app shell + login with school-picker
modal, students CRUD, dashboard, settings.

**v0.2 "Staff & Structure" (tagged v0.2.0)** — Teachers as a first-class section,
Personnel (roles vs job-titles), PROPRIETOR role, Classes (levels-first, add-arm
flow), Subjects mapped to levels, multiple guardians per student + sibling
linking, visible audit trail, session-activation safety (typed confirm +
enrollment warning), editable school profile.

**v0.3 "The Teacher's School" (tagged v0.3.0)** — teacher home ("My Classes"),
assessment-structure panel (weights sum to 100), grading-scale panel (WAEC
9-point + A-F presets), forced password change on first login, removed old
/users endpoints, GitHub Actions CI.

Test counts around: 167 backend + ~108 frontend. All acceptance runs passed.

---

## v0.4 "Grades" — APPROVED, ready to spec/build next

Scope is EXACTLY these five things (Dami confirmed — hold the line, don't add):

1. **Score entry** — bulk grid (designed for 100+ student classes: one screen,
   tab-through, save-as-you-go, survives connection drop). Teacher-scoped:
   teachers can ONLY enter scores for classes/subjects they're assigned to;
   admins/owner can enter anything.
2. **Grading** — score → letter grade via the school's grade boundaries (v0.3),
   AUTO, PLUS a MANUAL OVERRIDE option (some schools grade differently).
   Student's per-subject average shown AS A LETTER GRADE (not /20); class
   average shown the same way (Pronote-style comparison).
3. **Positions** — per-subject AND overall, computed at END OF TERM, shown on
   the term result / report card.
4. **Two-tier assessment** — each assessment_component carries an
   "approval-required" flag. CA/quizzes/continuous = counts immediately, no
   approval. Exams/big/end-of-year = require approval before publishing.
5. **Approval → publish flow** — for approval-flagged components only: teacher
   enters → DIRECTOR or OWNER reviews & publishes (owner is higher authority /
   can override) → results become visible. Small assessments skip this.

Confirmed design details:
- Approval flag lives on the **assessment component** (set once in settings),
  not chosen per-entry.
- Both director (PROPRIETOR-adjacent) and owner can review-and-publish; owner
  overrides. (Note: current roles are SUPER_ADMIN, PROPRIETOR, SCHOOL_ADMIN,
  TEACHER, PARENT, STUDENT — "director" vs "owner" distinction may need a role
  or a permission flag; resolve during spec.)
- Report-card DOCUMENT (printable) is v0.5, not v0.4. v0.4 is the data +
  entry + computation layer; results are viewable in-app.

Out of v0.4 scope (queued, see roadmap): report card doc, homework, calendar,
resources, messaging, parents, fees.

---

## Future roadmap (PROMISED — do not forget these)

Dami has explicitly asked for all of these over time. They are queued, not
dropped:

- **v0.5 Report Cards** — the printable term report document (Nigerian format:
  CA + exam per subject, totals, grades, positions, teacher/principal remarks).
  Positions computed in v0.4 surface here.
- **v0.6 Homework** — teachers set homework, students receive it (ties into the
  portal + calendar).
- **v0.7 School Calendar** — school days, holidays, "no class this week,"
  homework-due dates, event scheduling. Nigerian term/holiday rhythms.
- **v0.8 Resources** — teachers upload class lessons / notes / materials per
  class/subject. NEEDS FILE STORAGE (this is where Firebase Storage from the
  original blueprint finally earns its place — first file-upload feature).
- **v0.9 Messaging + Parent accounts** — Pronote-style portal: teacher↔student
  messaging, school-wide announcements, parent logins (parents linked to their
  children, see grades/homework/attendance). Parent password distribution is a
  real problem to solve (printable slips / SMS).
- **Fees / Bursar** — school fees managed in the accountant/bursar's account.
  The #1 real-world proprietor demand; not yet scheduled but expected to jump
  the queue once a real school weighs in.
- **Attendance** — (was in original roadmap) marking attendance, fast for big
  classes.
- **Promotion / re-enrollment** — move students between sessions, graduate
  SSS 3. Bumped up in priority after Dami accidentally activated an empty
  session during v0.1 testing (the activation-safety guard was the interim fix).
- **WAEC/NECO registration** — actual external exam registration (NOT the
  grading scale, which is done). Far future, real integration.
- **Deployment / production hardening** — currently laptop-only. Needs a VPS,
  HTTPS, tested backups, monitoring. Becomes urgent the moment a real school
  uses it. Design for Nigerian realities (2G, Android, cheap hosting).

Role hierarchy Dami wants (titles, from a v0.2 discussion — implemented as
JobTitle enum + coarse permission roles, NOT 12 separate permission levels):
Director/Proprietor → Principal → Vice Principal → Admin staff (Registrar,
Exam Officer, Bursar, Secretary, ICT Admin, Nurse, Counselor) → Teachers
(Class + Subject) → Parents → Students.

Also promised/noted:
- Teacher scoping: whether teachers keep whole-school student read access, or
  get restricted to their own classes, is a deferred per-school policy question.
- Multiple guardians per student: already built; parent accounts (v0.9) attach
  to guardian records.
- Nigerian class sizes are large (avg 51, up to 101+) — all class-scoped UIs
  must handle 100+ students (bulk entry, no per-student page-hopping).

---

## The standing strategic advice (from Claude, repeatedly)

The single highest-value next move is NOT more versions — it's putting the
current build in front of ONE real Nigerian proprietor/head teacher for 30
minutes and letting their reaction drive the roadmap. Especially before v0.4's
frontend, since grades are the most school-specific feature. Fees almost
certainly jumps the queue once a real school is asked. Dami has not yet named
a pilot school; this remains the open recommendation.

---

## How to resume in a new chat

Paste this whole brief, then say where you are (e.g. "v0.4 approved, ready for
step 1" or "mid-v0.4, step 3 committed"). Claude should: confirm it has the
context, then continue the method above — spec if the version isn't specced,
else the next build-order step. Always: plan → approve → build → prove →
commit → push. Keep versions tight. Don't forget the roadmap above.
