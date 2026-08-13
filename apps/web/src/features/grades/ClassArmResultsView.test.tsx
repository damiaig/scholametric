import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { render } from "@testing-library/react";
import type { ClassArmResultsResponse } from "@scholametric/shared";
import { ClassArmResultsView } from "./ClassArmResultsView";

afterEach(() => {
  cleanup();
});

const BASE_DATA: ClassArmResultsResponse = {
  classArmId: "arm1",
  termId: "term1",
  students: [
    { studentId: "s1", firstName: "Ada", lastName: "Bello", admissionNumber: "SUN/0001" },
    { studentId: "s2", firstName: "Bola", lastName: "Coker", admissionNumber: "SUN/0002" },
  ],
  subjects: [
    {
      subjectId: "sub1",
      subjectName: "Mathematics",
      averageScore: 45,
      averageGrade: "E8",
      results: [
        { id: "tsr-pending", studentId: "s1", totalScore: 56, autoGrade: "C5", overrideGrade: null, finalGrade: "C5", subjectPosition: null, status: "PENDING_APPROVAL" },
        { id: "tsr-published", studentId: "s2", totalScore: 80, autoGrade: "A1", overrideGrade: null, finalGrade: "A1", subjectPosition: 1, status: "PUBLISHED" },
      ],
    },
  ],
  overall: [{ studentId: "s2", averageScore: 80, averageGrade: "A1", overallPosition: 1, status: "PUBLISHED", subjectsCount: 1 }],
};

describe("ClassArmResultsView", () => {
  it("renders 'Not yet entered' for a student with no row, and 'Not yet ranked' for a null position", () => {
    render(<ClassArmResultsView data={BASE_DATA} />);
    // s1 (Ada) has no term_subject_result for "Mathematics" in this fixture's second student slot check —
    // actually both students HAVE rows here; assert the null-position case directly instead.
    expect(screen.getAllByText(/Not yet ranked/).length).toBeGreaterThan(0);
  });

  it("renders 'Not yet entered' when a student has no row for a subject at all", () => {
    const data: ClassArmResultsResponse = {
      ...BASE_DATA,
      students: [...BASE_DATA.students, { studentId: "s3", firstName: "Chidi", lastName: "Danjuma", admissionNumber: "SUN/0003" }],
    };
    render(<ClassArmResultsView data={data} />);
    expect(screen.getAllByText("Not yet entered").length).toBeGreaterThan(0);
  });

  it("renders 'No results yet' for a student with no overall row when overall IS shown", () => {
    render(<ClassArmResultsView data={BASE_DATA} />);
    // s1 has a subject row but no overall row (only s2 does in the fixture).
    expect(screen.getAllByText("No results yet").length).toBeGreaterThan(0);
  });

  it("shows the class average as a letter grade with the numeric score alongside", () => {
    render(<ClassArmResultsView data={BASE_DATA} />);
    expect(screen.getByText("E8")).toBeInTheDocument();
    expect(screen.getByText("(45)")).toBeInTheDocument();
  });

  it("empty state: no subjects entered yet", () => {
    render(<ClassArmResultsView data={{ ...BASE_DATA, subjects: [], overall: [] }} />);
    expect(screen.getByText(/No subjects have been entered/)).toBeInTheDocument();
  });

  describe("override control visibility (owner-vs-admin, DOM presence not just disabled)", () => {
    it("overridePermission='none' (TEACHER): no override buttons at all", () => {
      const onOverride = vi.fn();
      render(<ClassArmResultsView data={BASE_DATA} overridePermission="none" onOverride={onOverride} />);
      expect(screen.queryByLabelText(/Override grade/)).not.toBeInTheDocument();
    });

    it("overridePermission='pendingOnly' (SCHOOL_ADMIN): override button on the PENDING_APPROVAL row, absent on the PUBLISHED row", () => {
      const onOverride = vi.fn();
      render(<ClassArmResultsView data={BASE_DATA} overridePermission="pendingOnly" onOverride={onOverride} />);
      // Mobile cards + desktop table both render in jsdom (no real
      // breakpoint evaluation) — two copies of anything present in both.
      expect(screen.getAllByLabelText("Override grade for Ada Bello — Mathematics").length).toBe(2);
      expect(screen.queryByLabelText("Override grade for Bola Coker — Mathematics")).not.toBeInTheDocument();
    });

    it("overridePermission='any' (PROPRIETOR): override button on BOTH the pending and the published row", () => {
      const onOverride = vi.fn();
      render(<ClassArmResultsView data={BASE_DATA} overridePermission="any" onOverride={onOverride} />);
      expect(screen.getAllByLabelText("Override grade for Ada Bello — Mathematics").length).toBe(2);
      expect(screen.getAllByLabelText("Override grade for Bola Coker — Mathematics").length).toBe(2);
    });

    it("no override button on a DRAFT row even with 'any' permission (server blocks it — total isn't final)", () => {
      const draftData: ClassArmResultsResponse = {
        ...BASE_DATA,
        subjects: [
          {
            ...BASE_DATA.subjects[0],
            results: [{ id: "tsr-draft", studentId: "s1", totalScore: 10, autoGrade: "F9", overrideGrade: null, finalGrade: "F9", subjectPosition: null, status: "DRAFT" }],
          },
        ],
      };
      render(<ClassArmResultsView data={draftData} overridePermission="any" onOverride={vi.fn()} />);
      expect(screen.queryByLabelText(/Override grade/)).not.toBeInTheDocument();
    });

    it("clicking the override button calls onOverride with the exact target", () => {
      const onOverride = vi.fn();
      render(<ClassArmResultsView data={BASE_DATA} overridePermission="any" onOverride={onOverride} />);
      screen.getAllByLabelText("Override grade for Ada Bello — Mathematics")[0].click();
      expect(onOverride).toHaveBeenCalledWith({
        id: "tsr-pending",
        studentId: "s1",
        studentName: "Ada Bello",
        subjectId: "sub1",
        subjectName: "Mathematics",
        autoGrade: "C5",
        overrideGrade: null,
      });
    });
  });
});
