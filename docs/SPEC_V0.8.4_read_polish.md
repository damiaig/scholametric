# SPEC — v0.8.4 Lessons Read Polish (folds into v0.8.4, pre-tag)

**Status:** DRAFT for approval. No code until the build order is approved.
**Context:** v0.8.4's 5 build steps are built, green, and signed off, but NOT tagged. The
Step-6 acceptance walk surfaced one defect + three feature requests on the Lessons read
surface. Folding them in before the tag (same pattern as v0.8.3 round 2 / v0.5.1) rather
than shipping thin and chasing a v0.8.5 — a cahier de textes accumulates a full session of
lessons across several subjects, so filtering is closer to finishing the feature than polish.

**Frontend-only. ZERO backend changes.** The per-class-per-session lesson list is already
fetched and bounded, so all filtering happens client-side over the loaded array. No new
endpoints, no query params, no schema touch. (If a single session ever accumulates hundreds
of lessons and rendering drags, server-side paging is a separate later item — not now.)

**Applies to both read surfaces:** the student/parent read view (`LessonDateList` /
`MyLessonsPage`) AND the teacher list (`LessonClassPage`), for consistency — both grow the
same way. The read-only guarantee is untouched (no new write controls anywhere).

---

## 1. The defect — long body text doesn't wrap (MUST FIX)

The walk showed a long unbroken body string overflowing the card horizontally, unreadable.
Two parts:
- **Wrap:** the body renders with `overflow-wrap: anywhere` / `word-break` so any text —
  including a long unbroken string with no spaces — wraps to new lines and never overflows
  its container. Readable paragraph rendering.
- **View-more:** confirm the "view more" modal (spec'd for long bodies, Step 5) actually
  catches this — a long body shows a few lines (clamped) + a "view more" control that opens
  the full text in the modal. Verify the clamp threshold triggers on realistic long bodies,
  not just absurdly long ones. The clamped preview must itself wrap (the defect above).

This is a defect from the walk; it ships with the tag regardless of the filter decisions.

---

## 2. Subject filter

- A filter control (chip row or dropdown) listing **"All"** + each subject that actually has
  lessons in the loaded list (derived client-side from the data — no hardcoded subject list).
- Default **"All"**. Selecting a subject narrows the list to that subject.
- Student/parent: subjects present in their class's lessons. Teacher: subjects present in
  their lessons for that class.

## 3. Week filter

- A week selector built on the existing `StyledDatePicker` (the flatpickr wrapper in
  `components/ui` from v0.8): pick any date → the list narrows to lessons in that date's
  week (Mon–Sun containing the picked date, matching the app's Monday-anchored week).
- Default **"All weeks"** (no week filter). A clear reset back to all weeks.
- Chosen over the stepping `WeekNavigation`: searching past lessons wants to jump to an
  arbitrary week, not step one week at a time.

## 4. Show all vs. specific

- Default view = the full newest-first grouped list (all subjects, all weeks).
- The subject + week filters narrow it; they compose (a subject AND a week together).
- A visible **reset/"Show all"** that clears both filters back to the full list.
- When filters produce no matches: a clear empty state ("No lessons match these filters"),
  distinct from the genuine no-lessons-yet empty state.

---

## 5. Grouping interaction

The list stays grouped newest-first by lessonDate (unchanged). Filters narrow which lessons
(and therefore which date groups) appear. A week filter naturally collapses it to that
week's date groups; a subject filter thins each group.

---

## 6. Build order (one step: plan → approve → build → prove → review)

Single focused frontend step (it's one coherent change to the two read surfaces):
- The wrap + view-more defect fix on the lesson body.
- A shared filter bar (subject + week + reset) used by both `LessonDateList`/`MyLessonsPage`
  (student/parent) and `LessonClassPage` (teacher). Client-side filter helpers (pure fns,
  injectable for testability — the codebase pattern).
- Web tests: long body wraps (no overflow) + view-more opens; subject filter narrows;
  week filter narrows to the right week; filters compose; reset restores all; filtered-empty
  state distinct from no-lessons-yet; read-only guarantee still holds (no write controls
  introduced).

Then: re-walk the read view (wrap fixed, filters work), finish the rest of WALK_V0.8.4.md
(Part C parent, Part D walls), then tag v0.8.4.

---

## 7. What this does NOT touch
- Zero backend: no endpoints, no query params, no schema, no storage.
- Zero `features/homework/` changes.
- The read-only guarantee (no mark-done/upload/submission controls) is unchanged — this adds
  only read-side filtering + a text-rendering fix.
- No server-side paging (client-side filter of the bounded per-session list; paging is a
  later item only if volume demands it).
