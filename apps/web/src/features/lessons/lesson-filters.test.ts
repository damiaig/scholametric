import { describe, it, expect } from "vitest";
import { filterBySubjectId, filterByWeek, getLessonSubjectOptions } from "./lesson-filters";

interface Fixture {
  id: string;
  subjectId: string;
  subjectName: string;
  lessonDate: string;
}

function lesson(overrides: Partial<Fixture> = {}): Fixture {
  return { id: "l1", subjectId: "sub1", subjectName: "Mathematics", lessonDate: "2026-10-19", ...overrides };
}

describe("getLessonSubjectOptions", () => {
  it("dedupes by subjectId, preserving first-seen order", () => {
    const lessons = [
      lesson({ id: "l1", subjectId: "sub1", subjectName: "Mathematics" }),
      lesson({ id: "l2", subjectId: "sub2", subjectName: "English" }),
      lesson({ id: "l3", subjectId: "sub1", subjectName: "Mathematics" }),
    ];
    expect(getLessonSubjectOptions(lessons)).toEqual([
      { id: "sub1", name: "Mathematics" },
      { id: "sub2", name: "English" },
    ]);
  });

  it("returns an empty array for an empty list", () => {
    expect(getLessonSubjectOptions([])).toEqual([]);
  });
});

describe("filterBySubjectId", () => {
  const lessons = [lesson({ id: "l1", subjectId: "sub1" }), lesson({ id: "l2", subjectId: "sub2" })];

  it("returns the list unchanged for an empty subjectId (All)", () => {
    expect(filterBySubjectId(lessons, "")).toEqual(lessons);
  });

  it("narrows to lessons matching the given subjectId", () => {
    expect(filterBySubjectId(lessons, "sub1").map((l) => l.id)).toEqual(["l1"]);
  });

  it("returns an empty array when no lesson matches", () => {
    expect(filterBySubjectId(lessons, "sub-nonexistent")).toEqual([]);
  });
});

describe("filterByWeek", () => {
  const lessons = [
    lesson({ id: "before", lessonDate: "2026-10-18" }), // Sunday, the week before
    lesson({ id: "monday", lessonDate: "2026-10-19" }), // Monday, start of the week
    lesson({ id: "mid-week", lessonDate: "2026-10-22" }), // Thursday, same week
    lesson({ id: "sunday", lessonDate: "2026-10-25" }), // Sunday, end of the week
    lesson({ id: "after", lessonDate: "2026-10-26" }), // Monday, the week after
  ];

  it("returns the list unchanged for an empty weekAnchor (All weeks)", () => {
    expect(filterByWeek(lessons, "")).toEqual(lessons);
  });

  it("narrows to the Monday-Sunday week containing the picked date, inclusive of both boundaries", () => {
    const result = filterByWeek(lessons, "2026-10-22"); // any day in that week
    expect(result.map((l) => l.id)).toEqual(["monday", "mid-week", "sunday"]);
  });

  it("excludes the day immediately before Monday and immediately after Sunday", () => {
    const result = filterByWeek(lessons, "2026-10-19");
    expect(result.some((l) => l.id === "before")).toBe(false);
    expect(result.some((l) => l.id === "after")).toBe(false);
  });

  it("picking any day within the week yields the same result", () => {
    expect(filterByWeek(lessons, "2026-10-19").map((l) => l.id)).toEqual(filterByWeek(lessons, "2026-10-25").map((l) => l.id));
  });
});

describe("composing filterBySubjectId and filterByWeek", () => {
  it("narrows by subject AND week together", () => {
    const lessons = [
      lesson({ id: "match", subjectId: "sub1", lessonDate: "2026-10-20" }),
      lesson({ id: "wrong-subject", subjectId: "sub2", lessonDate: "2026-10-20" }),
      lesson({ id: "wrong-week", subjectId: "sub1", lessonDate: "2026-10-27" }),
    ];
    const result = filterByWeek(filterBySubjectId(lessons, "sub1"), "2026-10-20");
    expect(result.map((l) => l.id)).toEqual(["match"]);
  });
});
