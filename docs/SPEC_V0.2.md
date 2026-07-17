# ScholaMetric — SPEC v0.2 "Staff & Structure"

Goal: turn the v0.1 records system into a school *organization* system.
After v0.2 the platform knows who works at the school, what they teach,
who is responsible for each class, and how the school's subjects are
structured — the skeleton that grades (v0.4) will hang on. It also pays
v0.1's documented debts and installs the session-activation safety that
the acceptance run proved necessary.

Delivered when: the sidebar reads Dashboard / Students / Teachers /
Classes / Personnel / Settings; a proprietor can be created with the
right title and powers; teachers have profiles and real assignments;
subjects exist per level; activating an empty session requires typed
confirmation with an enrollment warning; a student can have multiple
guardians; and all acceptance criteria in §8 pass.

Design principle carried from the v0.2 discussions: **job title ≠
permission role.** Titles (Registrar, Bursar, Vice Principal...) are
display and organization; permission roles stay few and coarse. Two
schools may give the same title different powers later — the system
must never hard-wire title to permission.

---

## 1. Domain model (v0.2 additions)

### Enum changes (additive only — never remove values)
- `UserRole`: add `PROPRIETOR` (school owner; superset of SCHOOL_ADMIN
  within their school — and the future home of finance powers).
  Full enum: SUPER_ADMIN, PROPRIETOR, SCHOOL_ADMIN, TEACHER, PARENT,
  STUDENT.
- New enum `JobTitle` (from the agreed hierarchy):
  DIRECTOR_PROPRIETOR, PRINCIPAL, VICE_PRINCIPAL, REGISTRAR,
  EXAMINATION_OFFICER, BURSAR, SECRETARY, ICT_ADMINISTRATOR,
  SCHOOL_NURSE, GUIDANCE_COUNSELOR, TEACHER, OTHER.
- New enum `GuardianRelationship`: FATHER, MOTHER, STEPFATHER,
  STEPMOTHER, GRANDPARENT, UNCLE, AUNT, SIBLING, LEGAL_GUARDIAN, OTHER.

### staff_profiles (1:1 extension of users for all staff)
| column        | type      | notes                                     |
|---------------|-----------|-------------------------------------------|
| id            | uuid PK   |                                            |
| school_id     | uuid FK   | NOT NULL, indexed                          |
| user_id       | uuid FK   | UNIQUE — one profile per user              |
| staff_number  | text      | UNIQUE(school_id, staff_number), generated |
|               |           | like admission numbers: SUN/STF/0001       |
| job_title     | JobTitle  | required                                   |
| phone         | text      | nullable                                   |
| qualification | text      | nullable (e.g. "B.Ed Mathematics")         |
| date_employed | date      | nullable                                   |
| deleted_at / created_at / updated_at |  |                          |

Every user with role PROPRIETOR, SCHOOL_ADMIN, or TEACHER must have a
staff profile. Creating staff creates user + profile in one transaction.

### subjects
id, school_id (NOT NULL), name (e.g. "Mathematics"), code (nullable,
e.g. "MTH"), UNIQUE(school_id, name), soft delete, timestamps.

### subject_class_levels (which levels offer a subject)
id, school_id, subject_id (FK), class_level_id (FK),
UNIQUE(subject_id, class_level_id). Powers v0.4's "which subjects does
JSS 2 take" question.

### class_teacher_assignments (session-scoped — class teachers change yearly)
id, school_id, class_arm_id (FK), session_id (FK), teacher_user_id
(FK → users, must have role TEACHER and a staff profile),
UNIQUE(class_arm_id, session_id) — one class teacher per arm per
session. Timestamps.

### subject_teacher_assignments
id, school_id, subject_id (FK), class_arm_id (FK), session_id (FK),
teacher_user_id (FK), UNIQUE(subject_id, class_arm_id, session_id) —
one teacher per subject per arm per session (co-teaching is out of
scope until a real school asks). Indexes: (school_id, teacher_user_id,
session_id) for "what does Mrs. Bello teach".

### guardians
id, school_id (NOT NULL), first_name, last_name, phone (required),
email (nullable), address (nullable), soft delete, timestamps.
Index (school_id); trigram on names is NOT needed yet.

### student_guardians
id, school_id, student_id (FK), guardian_id (FK), relationship
(GuardianRelationship), is_primary (bool, default false),
UNIQUE(student_id, guardian_id). Exactly one is_primary per student
enforced by partial unique index (same hand-written-SQL pattern as
v0.1 — remember the migrate-drift rule in DECISIONS.md).

### Guardian migration & backfill
The students table keeps its guardian_name/phone/email columns for now
(frozen — no longer written by new code). The migration backfills: for
every existing student, create one guardian (split guardian_name into
first/last on the last space, best-effort) + a student_guardians row
with relationship OTHER and is_primary true. New admissions write ONLY
to the new tables. Dropping the old columns is a future migration once
verified in production use.

---

## 2. API (all /api/v1, tenant-scoped via JWT per CLAUDE.md §4)

### RBAC matrix additions
| Action                                | PROPRIETOR | SCHOOL_ADMIN | TEACHER |
|---------------------------------------|:----------:|:------------:|:-------:|
| Everything SCHOOL_ADMIN can do         | ✔          | ✔            |         |
| Edit own school profile (contact info) | ✔          | ✔            |         |
| Manage personnel (create/edit/reset)   | ✔          | ✔            |         |
| Manage subjects & assignments          | ✔          | ✔            |         |
| View teachers/classes/subjects         | ✔          | ✔            | ✔       |
| View own assignments                   | ✔          | ✔            | ✔       |

SUPER_ADMIN keeps schools CRUD only; still 403 on school-internal data.
Resolves the v0.1 open question: PATCH /schools/:id splits — a school's
PROPRIETOR/SCHOOL_ADMIN may PATCH their OWN school's name, address,
phone, email (id must equal their JWT schoolId, else 404); slug, type,
and status remain SUPER_ADMIN-only fields (400 if a school user sends
them).

### Personnel
- `GET /personnel?role=&jobTitle=&search=&page=` — staff list (user +
  profile joined).
- `POST /personnel` — { email, firstName, lastName, role
  (PROPRIETOR|SCHOOL_ADMIN|TEACHER), jobTitle, phone?, qualification?,
  dateEmployed?, password } → user + staff_profile, one transaction,
  staff number auto-generated (same advisory-lock pattern as admission
  numbers).
- `PATCH /personnel/:userId` — names, jobTitle, phone, qualification,
  role (cannot demote self; cannot change the last PROPRIETOR/
  SCHOOL_ADMIN of a school to TEACHER), status.
- `POST /personnel/:userId/reset-password` — moved from /users
  (endpoint kept as alias for one version, marked deprecated in API.md).

### Teachers (read-shaped views over personnel + assignments)
- `GET /teachers?search=&page=` — staff with role TEACHER.
- `GET /teachers/:userId` — profile + current-session assignments
  (class-teacher of, subjects taught with arms).
- `PUT /class-arms/:id/class-teacher` — { teacherUserId } → upsert the
  class_teacher_assignment for the CURRENT session (replaces existing).
  DELETE to unassign.
- `POST /subject-assignments` — { subjectId, classArmId, teacherUserId }
  → current session. DELETE /subject-assignments/:id.
  409 if the (subject, arm, session) slot is taken by someone else,
  with the current holder named in the message.

### Subjects
- `GET/POST/PATCH /subjects` (+ soft DELETE; deletion blocked with 409
  if the subject has assignments).
- `PUT /subjects/:id/levels` — { classLevelIds: [] } → replaces the
  subject's level set.

### Classes (read-shaped views for the new Classes tab)
- `GET /classes` — levels with their arms, each arm carrying: current
  enrollment count, class teacher (if any). One efficient query.
- `GET /class-arms/:id` — arm detail: level, class teacher, subject
  teachers, students enrolled in the current session (paginated).
- `POST /class-levels/:id/arms` — { name } → the natural "add arm B to
  JSS 1" flow (wraps the existing class-arms create).

### Guardians
- `GET /students/:id/guardians`, `POST /students/:id/guardians`
  (create guardian + link, or link an existing guardian by id —
  supports siblings sharing one parent record),
  `PATCH /guardians/:id`, `DELETE /students/:id/guardians/:guardianId`
  (unlink; blocked with 409 if it's the primary and others exist —
  reassign primary first; deleting the last link is allowed only with
  ?force=true).
- `PUT /students/:id/guardians/:guardianId/primary` — atomic primary
  swap respecting the partial unique index.
- Student create/detail endpoints now accept/return guardians via the
  new structure; POST /students takes guardians: [{...}] (min 1, one
  primary).

### Audit (pays the v0.1 debt)
- `GET /audit-logs?entityType=&entityId=&page=` — PROPRIETOR/
  SCHOOL_ADMIN only, tenant-scoped, newest first. Powers the student
  History tab; generic enough for future entity pages.

### Session activation safety
- `GET /sessions/:id/activation-preview` — { targetSession: {name,
  enrollmentCount}, currentSession: {name, enrollmentCount} }.
- `POST /sessions/:id/activate` now requires body { confirmName } that
  must equal the target session's name exactly; 400 with a clear
  message otherwise. (Term activation unchanged.)

---

## 3. Seed additions (idempotent, as always)

Sunrise: promote admin to PROPRIETOR title DIRECTOR_PROPRIETOR? No —
keep Adaobi as SCHOOL_ADMIN/PRINCIPAL; add one PROPRIETOR
(proprietor@sunrise.test, DIRECTOR_PROPRIETOR), 8 teachers with
realistic Nigerian names/titles/qualifications, staff numbers
SUN/STF/0001+. Subjects: Mathematics, English Language, Basic Science,
Civic Education, Social Studies, Agricultural Science, Business
Studies, CRS, IRS, Physics, Chemistry, Biology, Economics, Government,
Literature — with sensible level mappings (Physics/Chemistry/Biology
SSS-only, etc.). Assign a class teacher to every arm and subject
teachers covering JSS 1–2 at minimum. Guardians: backfill runs in the
migration; additionally give one seeded student a second guardian
(mother) to exercise the multi-guardian path. Hillcrest: 2 teachers,
4 subjects, one class-teacher assignment — enough for cross-tenant
tests.

---

## 4. Web app changes

Sidebar becomes: Dashboard / Students / Teachers / Classes / Personnel
/ Settings. Settings shrinks to: School (profile — now editable per
the RBAC resolution), Academic (sessions & terms only — class
management moves to Classes).

1. `/teachers` — DataTable (name, staff no. in JetBrains Mono, title,
   subjects count, class-teacher-of badge). Row → detail.
2. `/teachers/:id` — profile header; sections: Details, "Class teacher
   of" (assign/replace via dialog listing arms), "Subjects taught"
   (table of subject+arm, add via dialog: subject → arms multi-select
   → conflicts surfaced inline with the current holder's name).
3. `/classes` — the natural mental model: list of LEVELS (JSS 1, JSS 2
   ...) as cards/rows, each showing its arms as chips with enrollment
   counts and class-teacher initials. "Add level" creates a level;
   on each level an "Add arm" button creates B, C... (auto-suggest the
   next letter). Arm chip → `/classes/arms/:id`.
4. `/classes/arms/:id` — arm page: class teacher (assign/change),
   subject teachers table, students list (reuses DataTable, current
   session), link to each student.
5. `/personnel` — replaces /settings/users (route redirects): staff
   DataTable with role AND title columns, create-staff drawer (role +
   title pickers with one line explaining the difference), edit,
   reset-password (same show-once dialog).
6. `/students/:id` — Guardians section replaces the flat guardian
   fields: list with relationship + primary badge, add/edit/unlink,
   set-primary. History tab now renders the real audit trail from the
   new endpoint (action, actor, date, metadata like withdraw reason).
7. `/students/new` — guardian step now supports 1..n guardians (first
   is primary by default), and "link existing guardian" search for
   siblings.
8. Session activation (Settings → Academic): activate opens a dialog
   showing the activation-preview numbers with a plain-language
   warning when the target has fewer/zero enrollments ("2027/2028 has
   no enrolled students — students will not appear in lists until
   enrolled or promoted"), and requires typing the session name.
9. Empty-session guard rails: if the current session has zero
   enrollments, /students and /dashboard show a prominent explainer
   banner ("No students are enrolled in the current session
   (2027/2028)...") instead of bare emptiness.
10. TEACHER role: sees Teachers/Classes read-only (no assign buttons),
    own profile via user menu; Personnel hidden entirely.

---

## 5. Non-functional
- /classes and /teachers/:id must not N+1 (verify query counts).
- Everything usable at 360px; assignment dialogs keyboard-navigable.
- No emojis; Lucide; tokens per CLAUDE.md §6.

---

## 6. Explicitly out of scope (resist all temptation)
Grades, attendance, homework, timetables, fees, parent/student logins,
co-teaching, per-school custom titles or permission editing, dropping
the legacy guardian columns, promotion/re-enrollment workflow (the
activation guard is the v0.2 answer; promotion is its own future
version — moved up from v0.9, next in line after v0.2 unless the
pilot school says otherwise).

---

## 7. Build order (one Claude Code session per step)
1. Schema + migration (enums, staff_profiles, subjects,
   subject_class_levels, both assignment tables, guardians,
   student_guardians + partial unique, guardian backfill) + seed
   additions. Prove backfill correctness with query output.
2. Personnel + teachers API (staff transactions, staff numbers,
   assignments endpoints) + RBAC additions + e2e incl. cross-tenant.
3. Subjects + classes read APIs + audit-logs endpoint + school-profile
   PATCH split + session activation preview/confirm. E2e.
4. Students API guardian restructure (create/detail/guardian
   endpoints) + e2e incl. sibling-linking and primary-swap.
5. Web: sidebar restructure + Personnel + Teachers pages.
6. Web: Classes pages + assignment dialogs + subjects management.
7. Web: guardians UI + audit History tab + activation dialog + empty-
   session banners + school profile editing.
8. Polish + full v0.2 acceptance run (checklist below) on a fresh
   stack, tag v0.2.0.

---

## 8. Acceptance criteria
- [ ] Fresh `docker compose down -v` → up → migrate → seed passes; all
      v0.1 acceptance criteria STILL pass (no regressions).
- [ ] Existing seeded students each have exactly one primary guardian
      after backfill; the multi-guardian student shows two.
- [ ] Create a teacher via Personnel → they appear in Teachers; staff
      number SUN/STF/NNNN continues the sequence.
- [ ] Assign a class teacher to JSS 1 A; reassigning replaces cleanly;
      the arm page and teacher profile both reflect it.
- [ ] Assigning a subject+arm already held by another teacher → 409
      naming the holder, surfaced inline.
- [ ] Proprietor login works and can edit the school profile; sending
      slug/status in that PATCH → 400; SUPER_ADMIN still 403 on
      school-internal pages/data.
- [ ] Hillcrest admin sees zero Sunrise teachers/subjects/assignments;
      direct fetch by ID → 404.
- [ ] Activating a session now requires typing its name; the dialog
      shows both enrollment counts; empty-session banner appears when
      applicable and disappears in the enrolled session.
- [ ] Student History tab shows real audit entries incl. a withdraw
      reason.
- [ ] TEACHER sees no assign/mutation controls anywhere new; Personnel
      hidden.
- [ ] Full ci green; every new page usable at 360px.