# SPEC_V0.7.1 — "Navigable & Appealing" (UI clarity)

**Status:** DRAFT for approval. No code until §6 build order is approved.
**Depends on:** v0.7.0 (Evaluations & Grade Analytics) — tagged and pushed.
**Origin:** Dami's own acceptance walk of v0.7 — the features all work (Steps 1–5
proved and CI-green), but the UI is hard to navigate: Dami, who built it, got
lost trying to find a grade he'd just posted. If the builder can't find it, a real
Nigerian teacher never will. This version makes the working features findable and
appealing.

---

## 1. Theme

One theme: **make v0.7 navigable and aesthetically pleasing — without changing any
behavior.** Every item here is presentation, layout, or navigation. Nothing touches
what an endpoint returns, how a grade computes, the published-only walls, the
analytics, or the anonymity rule. Same discipline as v0.5.1 was to v0.5:
organization and clarity, not new features.

**Hard rule (the guardrail that keeps a big cosmetic version safe):** v0.7.1 is
UI-only. The instant a change alters endpoint behavior, grade logic, or a security
boundary, it is OUT of scope — the proven walls from v0.7 stay untouched. Any item
that seems to need a behavior change must STOP and be re-scoped, not folded in.

**Out of scope:** Homework (v0.8) appears only as styled *placeholder slots* in the
dashboards — the space is designed, the feature is not built. No sidebar changes
(the sidebar is fine). No new contextual-help program (the per-role /help pages
from v0.5.1/v0.6 already exist).

---

## 2. The approved dashboard designs (visual mockups approved by Dami)

Four role dashboards, one shared visual language: clean white cards, hairline
borders, metric cards on top, a read-only "recent" extract card, link cards at the
bottom, amber for "needs attention." All read-only — the overview displays and
links out; no editing happens on any dashboard.

### 2.1 — Student dashboard (APPROVED)
- Three metric cards: **your average /100**, **class average /100**, **position**.
- **Recent grades** card: latest evaluations/exams as rows (name · subject · type),
  each with the student's score /100 and the class average beside it; "View all →"
  links to the student Grades page. (This is where the "quick assessment" evaluation
  now surfaces — the gap Dami flagged.)
- Link cards: **Grades** (the new per-term evaluations+exams page, §4.9) and
  **Homework** (placeholder, "Coming soon").

### 2.2 — Teacher dashboard (APPROVED)
- Three metric cards: **classes I teach**, **subjects**, **needs grading** (amber).
- **My classes** card: each class as a row (class · subject, student count), with a
  **needs-grading warning inline** on any class with ungraded students, and
  **Enter grades / Results** actions on the row.
- **Recently posted** card: last evaluations/exams entered, each with its
  **publish state** (Published green / Draft grey) — so drafts-still-to-publish are
  visible at a glance.
- Link cards: **My classes** and **Homework** (placeholder).

### 2.3 — Admin/proprietor dashboard (APPROVED)
- Three metric cards: **students**, **teachers**, **classes**.
- **Publishing status** card: **Published** (green), **Waiting to publish** (amber —
  finished but unapproved), **Still in draft** (grey), across the school; links to
  Review & Publish.
- **Portal accounts** card: provisioned vs. not ("104 of 128 students have logins ·
  22 families still to provision"), with a **Provision** button.
- **Recent activity** card: light read-only audit extract; links to the audit log.

### 2.4 — Parent dashboard (APPROVED)
- Same as the student dashboard, **per selected child**, with a **child-switcher**
  on top: each linked child as a tappable card (selected = accent border), tapping
  switches all figures below to that child. Shows only children linked to this
  parent (the v0.6 allow-list rule, unchanged — display only).
- Per-child: average vs class average, position, **that child's recent grades**,
  link to that child's report card & exams, Homework placeholder.

---

## 3. The grades-navigation fix (highest-impact — the thing that got Dami lost)

The root problem: grades entry and results live in scattered, buried places, and
none is where a teacher's hand naturally goes.

### 3.1 (item 5) — Grades live INSIDE the class, one unified area
Decided model (confirmed with Dami): grades are not a top-level sidebar item — they
belong to a specific class+subject. From a class, a prominent **Grades** area with
two tabs in one place: **Enter scores** (evaluations + exams) and **Results** (the
computed averages / report card). Kills the "My Classes → Enter grades" vs
"Classes → Grades overview" split — one destination.

### 3.2 (item 6) — Evaluation list shown up front, not an empty dropdown
Landing on a class's Enter-scores shows the **list of evaluations** that exist for
that class/subject/term (name + description), each clickable to load its grid — with
a clear "no evaluations yet — create one" empty state. Replaces today's empty grid
gated behind a "Select…" dropdown a teacher has to decode.

### 3.3 (item 7) — Reachable from the Classes page
The Grades area is prominent on the class page (a tab or clear button), where a
teacher instinctively looks ("my class → grades") — not only under "My Classes →
Subjects I teach → Enter grades." The teacher's My-Classes shortcut stays as a fast
path, but it lands in the SAME unified Grades area, not a thinner separate page.

### 3.4 (item 8) — Clearer entry labels
"Enter grades" vs "Enter exam scores" explained so a teacher knows evaluations ≠
exams (a one-line label/hint, not a tour). Evaluations and exams presented as two
clearly-labelled tracks within the Enter-scores tab.

---

## 4. Styling & clarity of the working pages (polish)

### 4.1 (item 9) — Report card visual polish
The evaluation breakdown, per-evaluation class average/best/worst, and /100 totals
styled into a clean, readable Nigerian-report-card layout (building on the already-
decent v0.7 render). Consistent with the dashboard visual language. No data change —
purely presentation.

### 4.2 (item 10) — Results / overview page styling
Grades-overview and Review & Publish given consistent card styling and clear status
indicators (draft vs published at a glance).

### 4.3 (item 11) — Enter-scores grid clarity
The grid header shows clearly *which* evaluation is being graded and its class
context; the closed-term blocked state (already enforced server-side) is visually
obvious in the UI (not subtle) — the "shown, not silently failing" rule.

### 4.4 (item 12) — Publish/unpublish affordance
The publish state and publish/unpublish action made prominent on the scoring/results
page (currently easy to miss).

### 4.5 (item 13) — Exam views styling
The per-term "Show exams" panel and the year-long Exams page styled consistently
with the report card; exams clearly separate from evaluations; everything /100.

### 4.6 (item 14) — Portal accounts page polish
The provision / slip-printing flow and the accounts list given clearer layout — this
is where admins onboard families, so it should feel obvious.

### 4.7 (item 15) — Consistent card & dashboard styling
One visual language across all pages (the approved dashboard language) so the app
looks intentional, not functional-only. Falls out of touching each page; not a
separate build step.

### 4.8 (item 16) — Empty states everywhere
Every blank area says what to do ("No evaluations yet — create one"), never a bare
empty box. Applies across grades, results, exams, portal accounts.

### 4.9 (item 20) — Student/parent Grades page (NEW, from Dami's walk)
A dedicated **Grades** page for students (and per-child for parents): pick a term,
see that term's **evaluations and exams** together, full detail. The dashboard's
"Recent grades" card links here. This is the student-side of the same "give grades a
findable home" fix.

### 4.10 (item 18) — Grades shown, not hidden
The general principle Dami stated: wherever a grade or number exists, style it to
*show* — don't tuck it behind a click you have to guess. Governs every item above.

---

## 5. What is NOT changing
- **No behavior, no grade logic, no endpoint changes.** All display/layout/nav.
- **The published-only walls, the analytics, the anonymity rule** — untouched. If a
  UI item appears to need one changed, STOP and flag it, don't build it.
- **The sidebar** — stays as-is (Dami's call; it's good).
- **Homework** — placeholder slots only; the feature is v0.8.
- **Auth, roles, the portal walls from v0.6** — untouched.

---

## 6. Build order (numbered — each = one Claude Code session: plan → approve → build → PROVE (existing tests stay green, new web tests for new UI, no behavior change) → commit → push → chat reviews the diff)

*High-impact navigation first; dashboards next; styling polish last — so if we stop
early, the "unusable" problems are already fixed and the "make it prettier" ones are
what's left.*

1. **Grades-in-class navigation (items 5, 6, 7, 8).** The unified Grades area per
   class (Enter scores | Results), evaluation list up front, reachable from the
   Classes page, clearer track labels. The single most important step — it fixes
   the thing that got Dami lost. e2e-untouched (no behavior change); web tests for
   the new navigation.
2. **Student + parent dashboards (items 2.1, 2.4) + the student/parent Grades page
   (item 20).** The family-facing headline: recent grades, average vs class average,
   the child-switcher, the per-term grades page.
3. **Teacher + admin dashboards (items 2.2, 2.3).** Needs-grading, publishing status,
   portal-accounts onboarding, recent activity.
4. **Report card + results + grid + exam styling (items 9, 10, 11, 12, 13).** The
   working pages made clean and clear, blocked/publish states visible.
5. **Portal accounts polish + global (items 14, 15, 16, 18).** Onboarding flow,
   consistent cards, empty states everywhere, grades-shown-not-hidden as the final
   sweep.
6. **Acceptance + tag v0.7.1.** The FULL acceptance walk Dami paused — teacher hat
   (create/name/describe/grade/publish), admin hat, parent hat (report card, exams,
   analytics anonymous) — now on the navigable UI, plus a fresh-stack boot check.
   Then tag v0.7.1 as the first HUMAN-WALKED release.

**Per-step discipline:** every step must leave the existing e2e/web suites green
(no behavior regressed), add web tests for genuinely new UI, and change zero backend
behavior. Any diff that touches a service's return shape, a query's filter, or a
role check is out of scope for v0.7.1 and gets flagged, not merged.

---

## 7. How to start
Dami approves the four dashboard designs (done — all four approved as visual
mockups) and the text-described items 3–4 in this spec. Then §6 step 1 is a
plan-first Claude Code prompt — same loop as every version. Hold the line: this is
navigation + appearance, not behavior. The proven v0.7 walls do not move.
