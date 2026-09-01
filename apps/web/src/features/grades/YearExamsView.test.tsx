import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup, render } from "@testing-library/react";
import type { YearExamsResponse } from "@scholametric/shared";
import { YearExamsView } from "./YearExamsView";

afterEach(() => {
  cleanup();
});

const PARTIAL_YEAR: YearExamsResponse = {
  studentId: "st1",
  sessionId: "sess1",
  terms: [
    {
      termId: "term1",
      termName: "FIRST",
      subjects: [
        {
          subjectId: "sub1",
          subjectName: "Mathematics",
          exams: [{ examId: "e1", name: "Term 1 Exam", rawScore: 82, isAbsent: false, classAverageScore: 70, bestScore: 95, worstScore: 50 }],
          subjectExamAverage: 82,
          subjectExamGrade: "B2",
          classAverageScore: 75,
        },
      ],
      termExamAverage: null,
      termExamGrade: null,
      termExamPosition: null,
      status: null,
      classAverageScore: null,
    },
    {
      termId: "term2",
      termName: "SECOND",
      subjects: [],
      termExamAverage: null,
      termExamGrade: null,
      termExamPosition: null,
      status: null,
      classAverageScore: null,
    },
  ],
  overallExamAverage: null,
  overallExamGrade: null,
  yearExamPosition: null,
  termsCount: 0,
  overallStatus: null,
  generalClassAverage: null,
};

describe("YearExamsView", () => {
  it("renders a partially-published year: term FIRST's published subject shows, term SECOND is an empty (not error) block", () => {
    render(<YearExamsView data={PARTIAL_YEAR} />);

    expect(screen.getByText("First term")).toBeInTheDocument();
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText("Term 1 Exam")).toBeInTheDocument();
    expect(screen.getAllByText("82")).toHaveLength(2); // one exam row + the subject average

    expect(screen.getByText("Second term")).toBeInTheDocument();
    expect(screen.getByText("No exams published for this term yet.")).toBeInTheDocument();

    expect(screen.getByText("Not yet available.")).toBeInTheDocument();
  });

  it("v0.7 step 5: renders per-exam and per-subject class stats, and shows nothing for the term-level stat when its own aggregate is null", () => {
    render(<YearExamsView data={PARTIAL_YEAR} />);

    expect(screen.getByText("Class avg 70 · Best 95 · Worst 50")).toBeInTheDocument();
    expect(screen.getByText("Class avg 75")).toBeInTheDocument();
    // Term FIRST's own termExamAverage/classAverageScore are both null (the
    // term's cross-subject aggregate never published) — only the subject-
    // and exam-level "Class avg" strings above exist, nothing extra.
    expect(screen.getAllByText(/Class avg/).length).toBe(2);
  });

  it("renders the overall average once the year is fully published", () => {
    const FULL: YearExamsResponse = {
      ...PARTIAL_YEAR,
      overallExamAverage: 75,
      overallExamGrade: "B3",
      yearExamPosition: 2,
      termsCount: 3,
      overallStatus: "PUBLISHED",
      generalClassAverage: 65,
    };
    render(<YearExamsView data={FULL} />);

    expect(screen.getByText("B3")).toBeInTheDocument();
    expect(screen.getByText("(75)")).toBeInTheDocument();
    expect(screen.getByText("#2")).toBeInTheDocument();
    expect(screen.getByText("3 term(s)")).toBeInTheDocument();
    expect(screen.getByText("Class avg 65")).toBeInTheDocument();
  });

  it("shows the no-terms empty state when the session has none", () => {
    render(<YearExamsView data={{ ...PARTIAL_YEAR, terms: [] }} />);
    expect(screen.getByText("No terms yet this session.")).toBeInTheDocument();
  });
});
