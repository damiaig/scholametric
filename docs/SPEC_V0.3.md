# ScholaMetric — SPEC v0.3 "The Teacher's School"

Goal: give teachers a home of their own, and configure the school for
academics. After v0.3, a teacher logs in and lands on *their* classes —
not an admin's dashboard — and the school has a defined assessment
structure (CA/Exam weights, grade boundaries) ready for score entry in
v0.4. v0.3 builds the doorway; v0.4 walks through it.

Origin of every item: the teacher-home finding from the v0.2 manual
run (a teacher's landing page was an admin dashboard), the grades
plumbing the roadmap requires before any score is typed, and the small
debts logged in DECISIONS.md. Score ENTRY is explicitly not here.

Delivered when: teacher@sunrise.test logs in and sees "My Classes";
the school's assessment components and grade boundaries are editable
by admins and seeded to Nigerian standards; new staff must change
their temporary password on first login; the deprecated /users
endpoints are gone; CI runs automatically on GitHub; and all §8
acceptance criteria pass.

---

## 1. Domain model (v0.3 additions)

### assessment_components (the school's scoring structure)
| column     | type | notes                                          |
|------------|------|------------------------------------------------|
| id         | uuid PK |                                             |
| school_id  | uuid FK | NOT NULL, indexed                           |
| name       | text | e.g. "CA 1", "CA 2", "Exam"; UNIQUE(school_id, name) |
| weight     | int  | percentage; the school's active set must sum to 100 (validated at the API layer on every mutation, not by constraint) |
| sort_order | int  | display/entry order                            |
| deleted_at / created_at / updated_at | | soft delete — components with recorded scores (v0.4+) will block hard removal |

School-wide in v0.3 (per-level schemes are a future need — note in
DECISIONS.md, do not build).

### grade_boundaries (score → grade mapping)
| column    | type | notes                                            |
|-----------|------|--------------------------------------------------|
| id        | uuid PK |                                               |
| school_id | uuid FK | NOT NULL, indexed                             |
| grade     | text | "A1", "B2"... or "A", "B"; UNIQUE(school_id, grade) |
| min_score | int  | 0-100                                            |
| max_score | int  | 0-100; ranges must tile 0-100 with no gaps or overlaps (API-layer validation on the full set) |
| remark    | text | "Excellent", "Very Good", "Fail"...              |
| sort_order| int  |                                                  |
| created_at / updated_at | |                                        |

### users.must_change_password
New boolean column, default false. Set true by: personnel creation and
password reset. Cleared by: successful POST /auth/change-password.

### Removals
The deprecated POST/PATCH /users endpoints and their controller paths
are deleted (personnel replaced them; reset-password alias also goes).
docs/API.md updated; a DECISIONS.md entry marks the removal.

---

## 2. API (all /api/v1, tenant-scoped per CLAUDE.md §4)

### Teacher's own view
- `GET /me/teaching` — TEACHER (also works for any staff with
  assignments): { classTeacherOf: [{classArm + level + enrollment
  count}], subjects: [{subject, classArm, level}] } for the CURRENT
  session. One efficient query set, no N+1.
- Teachers keep read access to the school-wide students list in v0.3
  (unchanged RBAC); whether that stays is a per-school policy question
  deferred until a real school weighs in (DECISIONS.md).

### Assessment structure (PROPRIETOR / SCHOOL_ADMIN)
- `GET /assessment-components` — ordered by sort_order.
- `PUT /assessment-components` — replaces the full set atomically:
  [{name, weight, sortOrder}]. Validates: 1-8 components, weights are
  positive integers summing to exactly 100, names unique. Replacing is
  all-or-nothing in one transaction. (Full-set PUT avoids ever having
  a persisted set that doesn't sum to 100.)
- `GET /grade-boundaries` — ordered by sort_order.
- `PUT /grade-boundaries` — replaces the full set atomically.
  Validates: 2-12 rows, ranges are integers within 0-100, tile the
  full 0-100 with no gaps/overlaps, grades unique.
- `GET /grading-presets` — static: the WAEC 9-point preset (A1 75-100
  Excellent, B2 70-74 Very Good, B3 65-69 Good, C4 60-64 Credit,
  C5 55-59 Credit, C6 50-54 Credit, D7 45-49 Pass, E8 40-44 Pass,
  F9 0-39 Fail) and a simple A-F preset — for one-click apply in the
  UI (apply = client fills the PUT).
- All mutations audited.

### Forced password change
- Login response gains mustChangePassword: boolean.
- `POST /auth/change-password` — { currentPassword, newPassword } —
  authenticated, any role. Verifies current, enforces min 8 chars,
  clears the flag, revokes all OTHER refresh-token families (keep the
  current session), audited (no password material in the log).
- While mustChangePassword is true, every endpoint EXCEPT
  change-password, /auth/me, and logout returns 403 with code
  PASSWORD_CHANGE_REQUIRED (guard-level, like @Public but inverse).

---

## 3. Seed additions (idempotent)
- Sunrise + Hillcrest: WAEC 9-point grade boundaries; assessment
  components CA 1 (20), CA 2 (20), Exam (60).
- One Sunrise teacher seeded with must_change_password = true
  (newteacher@sunrise.test) to exercise the flow.

---

## 4. Web app changes

1. Teacher home: when role is TEACHER, /dashboard renders "My
   Classes" instead of the admin dashboard — cards for each class
   they're class teacher of (level+arm, enrollment count, → arm page)
   and a "Subjects I teach" table (subject, class, → arm page). Empty
   state if no assignments ("You have no class assignments yet — your
   school admin assigns these."). Admin/proprietor dashboard
   unchanged.
2. Sidebar for TEACHER: "My Classes" label replaces "Dashboard";
   Students/Teachers/Classes remain (read-only as today).
3. Settings → Academic gains two panels (admin only):
   - Assessment structure: editable rows (name, weight, order), a
     live "total: N/100" indicator, save disabled until 100, saved
     via the atomic PUT.
   - Grading scale: editable boundary rows with live gap/overlap
     validation mirrored client-side, plus "Apply WAEC 9-point" /
     "Apply A-F" preset buttons (confirm dialog — replaces the set).
4. Forced password change: after login, if mustChangePassword, route
   to a full-screen /change-password (no sidebar), friendly copy
   ("Choose your own password to continue"), then into the app.
   Deep-links honor the redirect. Reset-password dialog copy gains:
   "They'll be asked to choose a new password at first login."
5. Polish debt: fix the Subjects tab level-chip wrapping at 768px.
6. All states, 360px, tokens — as always.

---

## 5. CI (mini-step, pre-approved constitution amendment)
Add to CLAUDE.md §7: "CI runs on GitHub Actions for every push."
Workflow: .github/workflows/ci.yml — checkout, pnpm install (cached),
postgres:16 + redis:7 service containers, migrate + seed, then
pnpm run ci. Must pass on the first real push (iterate locally with
act or by pushing to a branch if needed).

---

## 6. Explicitly out of scope
Score entry, results, report cards (v0.4+); promotion/re-enrollment;
per-level assessment schemes; restricting teachers' school-wide read
access; parent/student logins; fees; the SUPER_ADMIN school-edit audit
gap (needs design thought — carry the debt, note it).

---

## 7. Build order
1. Schema + migration (two tables, must_change_password) + seed +
   the /users endpoint removal. Prove seed and removal (404s).
2. API: /me/teaching, assessment-components + grade-boundaries +
   presets, change-password + the PASSWORD_CHANGE_REQUIRED guard.
   Full e2e incl. atomic-PUT validation edges (sum≠100, gap, overlap),
   flag lifecycle, other-sessions revocation, cross-tenant.
3. CI: GitHub Actions workflow green on a real push.
4. Web: teacher home + sidebar variant + /change-password flow.
5. Web: assessment structure + grading scale panels with presets +
   the 768px chip fix.
6. Acceptance + polish on a fresh stack; tag v0.3.0.

---

## 8. Acceptance criteria
- [ ] Fresh down -v → up → migrate → seed; all v0.1 AND v0.2
      acceptance criteria still pass.
- [ ] teacher@sunrise.test lands on My Classes showing their real
      assignments; an unassigned teacher sees the friendly empty
      state; admin dashboard unchanged.
- [ ] newteacher@sunrise.test is forced through change-password
      before reaching anything; after changing, logs in normally;
      their other sessions are revoked.
- [ ] Admin resets a password → dialog mentions first-login change →
      that user is flagged.
- [ ] Assessment components reject a 90-total save client- and
      server-side; accept 100; the saved order drives display.
- [ ] Grade boundaries reject a gap (e.g. missing 45-49) and an
      overlap; WAEC preset applies in one click and persists.
- [ ] Old /users endpoints return 404; API.md reflects removal.
- [ ] GitHub Actions is green on the tagged commit.
- [ ] Cross-tenant: hillcrest admin cannot read/write sunrise
      components/boundaries (404).
- [ ] Full ci green locally; every new page usable at 360px.
