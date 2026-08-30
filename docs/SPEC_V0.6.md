# SPEC_V0.6 — "The Portal"

**Status:** APPROVED design — Q1–Q5 and Q2a–Q2d all resolved. §5 build order
ready to approve; no code until it is. Step 1 is a plan-first Claude Code prompt.
**Depends on:** v0.5.1 (Organization & Polish) — shipped and tagged.
**Origin:** v0.6 was slated as *Homework*. Scoping it revealed that Homework as
Dami described it (students tick "done" / submit online, parents see assignments)
silently depends on three things that don't exist yet: **student login**,
**parent login**, and **file storage** (v0.8). You can't deliver homework to
people who can't log in. Bigger discovery underneath that: **v0.4 Grades and
v0.5 Report Cards were built for students and parents who currently have no way
to see them.** The audience for everything shipped so far can't reach it.

So the order changes: **v0.6 builds the floor (the Portal), v0.7 becomes
Homework** (clean, no hidden dependencies), and **v0.8 Resources + file storage**
turns on online-submission homework and teacher attachments. This keeps one
theme per version and makes each unlock the next.

---

## 1. Theme

One theme: **students and parents can log in and see what's already been built.**
Read-only. A student logs in and sees their own published grades and report
cards; a parent logs in and sees the same for each of their children. And it
solves, once, the problem flagged since v0.2 — **how credentials actually reach
families** — with printable slips, not an SMS/email dependency the pilot can't
rely on.

Nothing new is *computed* here. This version is auth wiring + read views +
credential distribution on top of scaffolding that already exists (the
`PARENT`/`STUDENT` roles, guardian records with sibling linking from v0.2,
forced-password-change-on-first-login from v0.3, the report-card renderer and
Results view from v0.5). That's what keeps it a single, contained theme.

**Out of scope (each has its own version):** homework (v0.7), any file upload —
teacher attachments *or* student submissions (v0.8), messaging (v0.9), fees,
attendance. And: no student/parent *writes* anything in v0.6 except their own
password. Read-only portal. Hold the line.

---

## 2. The decisions (all resolved)

### 2.1 — How accounts get created and how credentials reach families
The data is already there: every student is a record; every guardian is a record
with contact info, linked to their children (v0.2). Accounts are **generated from
existing records**, not typed in.

An admin/proprietor action **provisions portal accounts from existing student +
guardian records** — one `STUDENT` account per student, and **one `PARENT`
account per family** (see 2.2). Each account gets a system-generated username
(2.2) and a **numeric temp password**, and **forced-password-change-on-first-
login (v0.3) fires and hard-blocks the account until the password is changed.**
Distribution is **printable credential slips** (2.5) — offline, no SMS/email
dependency, matches the 2G/cheap-hosting Nigerian reality. SMS/email delivery is
a deferred future enhancement, not v0.6.

### 2.2 — Usernames, families, and the password rule

**Login is username-based, not email** (staff keep email login; students/parents
get usernames on the same school-picker login screen — see §4).

**The username stem is ALWAYS the surname (family name), in CAPS.** The structure
around that stem encodes the family:

- **Family code** = `SURNAME`. If another **unrelated** family already holds that
  surname in the same school, the next family's code takes a trailing **letter**:
  `OKAFOR`, then `OKAFORB`, `OKAFORC`, … (surnames are alphabetic, so a real
  surname never ends in a digit — this keeps the two axes below unambiguous).
- **Parent** (one account per family) = the bare family code: `OKAFOR`. Always
  ends in a letter.
- **Students** = family code + a **digit** per sibling: `OKAFOR1`, `OKAFOR2`, …
  Always ends in a digit.

**The rule that keeps it unambiguous:** a trailing **digit always means "which
sibling"**; a trailing **letter always means "which unrelated same-surname
family."** Different terminal characters → `OKAFOR2` (second Okafor child) can
never be confused with, or collide with, `OKAFORB` (a second, unrelated Okafor
family's parent). Nobody has to *decode* a username: the slip names the child
("Chidi Okafor — JSS 1 A"), so uniqueness is the only requirement.

**SCHOOL-WIDE UNIQUENESS IS A HARD GUARANTEE.** No two accounts in one school
ever share a username. This is guaranteed three ways, belt-and-braces:
1. *By construction* — family codes are unique per school (surname + escalating
   letter until free); students append a per-family digit; parents (letter-
   terminal) and students (digit-terminal) occupy disjoint namespaces.
2. *By a final check at provisioning* — each generated username is tested against
   **every existing username in that school**, and if any collision remains for
   any reason, the family's disambiguation escalates (next letter, then double
   letters if ever needed) until the whole family's names are free.
3. *By the database* — a **unique constraint on `(school_id, username)`** makes a
   duplicate impossible to persist even if the logic were wrong.

**"Family" is the existing link, not the surname string.** Provisioning groups
students into families using the **guardian / sibling links already in the data
(v0.2)** — NOT by matching surname text. This is what prevents two unrelated
Okafor families from being merged (a privacy leak: one family's parent seeing
another's child), and what correctly keeps linked siblings with *different*
surnames in one family. Surname is only the display stem.

**Resolved sub-decisions:**
- **(a) Single-child family:** the student is `OKAFOR1` (always a digit) so a lone
  child never clashes with the parent's bare `OKAFOR`, and a sibling enrolled
  later simply takes `OKAFOR2` — no renumbering.
- **(b) Blended family / siblings with different surnames:** the family stem is
  the **primary guardian's surname**, and all their children share it (the
  "always the family name" rule; using each child's own surname would make the
  family grouping invisible).
- **(c) One parent account per family when a child has two guardians (mum + dad):**
  the single login belongs to the **primary guardian**; the other guardian gets
  no separate login in v0.6. If no "primary guardian" flag exists in the data
  today, provisioning picks the first-listed guardian and we add a small
  primary flag admins can change.
- **(d) Stability:** once a username has been issued (and a slip printed) it is
  **permanent** — provisioning never renumbers existing accounts; a new
  sibling/student only ever takes the next free digit/letter.

**Password rule:** every account is issued a **numeric temp password**. On first
login the user **must** change it and **the account is unusable until they do**
(hard block, not a dismissible prompt). Reuse the v0.3 forced-password-change
flow — confirm in the build step that it hard-blocks all portal access.

### 2.3 — Exactly what a STUDENT can see
Read-only, and **only what's been made final.** The v0.5 reconciliation was
"publish = final & visible to parents / on the report card" — so **draft, pending,
and unpublished results must never appear in the portal.**

A student sees, for **themselves only**: their **published** per-subject grades
(never draft/pending); their **report card(s)** for closed/published terms (the
v0.5 renderer, reused); their **positions exactly as they appear on the report
card** (no separate live leaderboard); their own basic profile (read-only).
Nothing unpublished, nothing about other students. Empty state when nothing is
published yet ("No results published yet").

### 2.4 — Exactly what a PARENT can see, and multi-child
A parent sees the **same read scope as 2.3, for each linked child**, via a
**child-switcher** — only children actually linked to that family; only published
results; nothing about unrelated students. Cross-school parent accounts are out
of scope (each family is school-scoped).

### 2.5 — Printable credential slips
Admin/proprietor can **generate printable slips** — one per student and one per
family (the parent account) — each showing the school, the username, the temp
password, and a one-line "first login forces a password change" note.
Client-side print, same approach as the v0.5 report card (no server-side file
storage — that's v0.8). Batch-printable per class-arm so a class's slips print
together. **Forgot-password** = admin **resets and reissues a slip** (no
self-service reset without email/SMS infra) — deferred.

---

## 3. What is NOT changing (and stays out)
- **No new computation.** Grades, positions, absent handling, report-card
  contents are all v0.4/v0.5 and unchanged — the portal only *displays* them.
- **Publish stays the visibility gate.** The portal reads published results only;
  the publish/unpublish/close machinery is untouched.
- **Staff experience unchanged.** Admin/proprietor/teacher views are as they are;
  this adds portal account types and read views, it doesn't alter staff flows.
- **No writes from the portal** except a student/parent changing their own
  password. No profile editing, no homework, no messaging, no uploads.

---

## 4. Data / enforcement notes
- **Account model:** a portal account is a `User` (existing auth entity) with role
  `STUDENT` or `PARENT`, **linked** to the existing Student record (student) or —
  for the one-per-family PARENT — the **primary Guardian** of that family.
  Provisioning creates these from records that already exist; it does not
  duplicate student/guardian data. Every portal `User` carries `school_id`.
- **Username uniqueness is enforced at the database:** a **unique constraint on
  `(school_id, username)`** (migration via `--create-only` + hand-reviewed SQL per
  CLAUDE.md). Provisioning also performs the school-wide free-name check (§2.2).
- **Family grouping is the core of provisioning.** Group students by the existing
  guardian/sibling links (§2.2), assign a stable school-unique family code
  (surname stem + escalating letter for unrelated same-surname collisions),
  number students within a family by digit, issue one parent account per family
  (primary guardian). **Idempotent + stable:** re-running creates accounts only
  for records that lack one, and never renumbers an issued username. If sibling
  links are patchy in the data, fall back to "one family per primary guardian"
  and flag it.
- **Login surface:** extend the existing school-picker login to accept a
  **username** (student/parent) alongside **email** (staff); role + school resolve
  from the account; forced-password-change hard-blocks first use.
- **Multi-tenancy holds unconditionally.** JWT carries `school_id`; a student/
  parent seeing another school's data (or another student's within the same
  school) returns **404**, e2e-covered per CLAUDE.md, exactly as for staff.
- **Published-only enforcement is a hard boundary, tested:** a portal read of a
  draft/pending/unpublished result must 404 / return-nothing, never leak. This is
  the most important new test surface in the version — an unpublished-grade leak
  to a parent is the worst-case bug.
- **Student read scope = self only.** Parent read scope = **linked children only**
  (reuse the guardian↔student link from v0.2; do not re-implement linkage).
- **Reuse, don't fork:** forced-password-change (v0.3), the report-card renderer
  and Results view (v0.5), the school-picker login, and the guardian/sibling links
  (v0.2) are all reused. New code is the provisioning + family-coding action, the
  username-login path, the two read-scoped portal views, and the slip printout.

---

## 5. Build order (numbered — each = one Claude Code session: plan → approve → build → PROVE (real e2e + live stack) → commit → push → chat reviews the diff)

1. **Portal account provisioning + family coding (2.1 + 2.2).** The core
   algorithm: group students into families by existing guardian/sibling links;
   assign stable, **school-unique** family codes (surname stem + collision
   letters, with the free-name check); number siblings by digit; issue one
   `STUDENT` account per student and one `PARENT` account per family (primary
   guardian), each with a numeric temp password and forced-change armed. Add the
   `(school_id, username)` unique constraint. Admin/proprietor-only; school-scoped.
   **Idempotent and stable** (never renumber issued usernames). e2e: right
   accounts for right records; **no two usernames equal within a school**;
   unrelated same-surname families NOT merged and get distinct codes; linked
   different-surname siblings ARE one family; one parent per family; school-scoped;
   cross-tenant 404; re-run creates no dupes and renumbers nothing. Handle the
   patchy-sibling-link fallback and the primary-guardian designation.
2. **Username login path (2.2).** Extend the school-picker login to accept
   username (student/parent) alongside email (staff); role + school resolve from
   the account; forced-password-change **hard-blocks** first use. e2e/web (student
   and parent log in; wrong-school 404; must-change-password blocks until done).
3. **Student read views (2.3).** Student sees own **published** grades + report
   card(s) + positions-as-on-report-card; empty state when nothing published.
   e2e (student sees only own, only published; a draft/pending result never
   appears; cross-tenant + cross-student 404).
4. **Parent read views + child-switcher (2.4).** Parent sees each **linked** child,
   same read scope, switchable; nothing for unlinked students. e2e (parent sees
   only linked children, only published; multi-child; unlinked-student 404).
5. **Printable credential slips (2.5).** Per-student and per-family slips,
   batch-printable per class-arm, client-side print. Includes the admin
   **reset-and-reissue** path for forgot-password.
6. **Polish + guide.** Portal empty states, student/parent additions to the
   per-role `/help` page (v0.5.1), password-change reachable in the portal,
   general portal UI polish.
7. **Acceptance + tag v0.6.0.** Fresh-stack walk: provision accounts (confirm the
   family-coding and school-wide uniqueness on real seed data — including an
   unrelated same-surname pair) → print slips → log in as a student (see only own
   published) → log in as a parent (switch between children, see only published)
   → confirm no unpublished leak → confirm cross-tenant/cross-student 404. Then
   Dami's Mrs.-Nwachukwu pass, this time **also wearing the parent hat.**

---

## 6. How to start
Design is fully resolved. Approve §5, then step 1 is a plan-first Claude Code
prompt — same loop as every version. Hold the line: this is the read-only Portal
(login + view + distribute), **not** homework and **not** file upload.

**Seed-data note for the acceptance walk:** confirm the seed has at least one
guardian linked to **multiple** children (child-switcher test), at least one
student with a **published** result *and* one with **nothing published** (empty-
state + no-leak tests), and — to prove the collision handling — **two unrelated
students sharing a surname** (family-code disambiguation + uniqueness test). If
the seed lacks these, a small seed addition is part of step 1.
