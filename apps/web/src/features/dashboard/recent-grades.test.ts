import { describe, it, expect } from "vitest";
import type { ReportCardResponse, YearExamsResponse } from "@scholametric/shared";
import { buildGradesBySubject } from "./recent-grades";

const BASE_REPORT_CARD: ReportCardResponse = {
  studentId: "st1",
  firstName: "Chidi",
  lastName: "Okafor",
  admissionNumber: "SUN/2026/0099",
  classArmId: "arm1",
  termId: "term1",
  sessionId: "sess1",
  subjects: [],
  overall: null,
  runningAverageScore: null,
  remarks: { teacherRemark: null, teacherRemarkBy: null, teacherRemarkAt: null, principalRemark: null, principalRemarkBy: null, principalRemarkAt: null },
};

describe("buildGradesBySubject", () => {
  it("takes the LAST (most recent) evaluation per subject, not the first", () => {
    const reportCard: ReportCardResponse = {
      ...BASE_REPORT_CARD,
      subjects: [
        {
          subjectId: "sub1",
          subjectName: "Mathematics",
          needsTeacherAssignment: false,
          evaluations: [
            { evaluationId: "e1", name: "CA 1", description: "d1", rawScore: 10, isAbsent: false, classAverageScore: null, bestScore: null, worstScore: null },
            { evaluationId: "e2", name: "CA 2", description: "d2", rawScore: 20, isAbsent: false, classAverageScore: null, bestScore: null, worstScore: null },
          ],
          totalScore: 15,
          autoGrade: null,
          overrideGrade: null,
          finalGrade: null,
          subjectPosition: null,
          status: "PUBLISHED",
          classAverageScore: null,
        },
      ],
    };

    const rows = buildGradesBySubject(reportCard, undefined);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: "eval:e2", name: "CA 2", subjectName: "Mathematics", type: "Evaluation", rawScore: 20 });
  });

  it("takes the LAST exam per subject from the current term's year-exams entry", () => {
    const currentTermExams: YearExamsResponse["terms"][number] = {
      termId: "term1",
      termName: "FIRST",
      subjects: [
        {
          subjectId: "sub1",
          subjectName: "Mathematics",
          exams: [
            { examId: "ex1", name: "Test 1", rawScore: 50, isAbsent: false, classAverageScore: null, bestScore: null, worstScore: null },
            { examId: "ex2", name: "Test 2", rawScore: 60, isAbsent: false, classAverageScore: null, bestScore: null, worstScore: null },
          ],
          subjectExamAverage: 55,
          subjectExamGrade: null,
          classAverageScore: null,
        },
      ],
      termExamAverage: null,
      termExamGrade: null,
      termExamPosition: null,
      status: null,
      classAverageScore: null,
    };

    const rows = buildGradesBySubject(BASE_REPORT_CARD, currentTermExams);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: "exam:ex2", name: "Test 2", subjectName: "Mathematics", type: "Exam", rawScore: 60 });
  });

  it("merges evaluations and exams across subjects, sorted by subject name then Evaluation before Exam", () => {
    const reportCard: ReportCardResponse = {
      ...BASE_REPORT_CARD,
      subjects: [
        {
          subjectId: "sub2",
          subjectName: "Physics",
          needsTeacherAssignment: false,
          evaluations: [{ evaluationId: "e1", name: "CA 1", description: "d", rawScore: 30, isAbsent: false, classAverageScore: null, bestScore: null, worstScore: null }],
          totalScore: 30,
          autoGrade: null,
          overrideGrade: null,
          finalGrade: null,
          subjectPosition: null,
          status: "PUBLISHED",
          classAverageScore: null,
        },
      ],
    };
    const currentTermExams: YearExamsResponse["terms"][number] = {
      termId: "term1",
      termName: "FIRST",
      subjects: [
        {
          subjectId: "sub2",
          subjectName: "Physics",
          exams: [{ examId: "ex1", name: "Exam 1", rawScore: 40, isAbsent: false, classAverageScore: null, bestScore: null, worstScore: null }],
          subjectExamAverage: 40,
          subjectExamGrade: null,
          classAverageScore: null,
        },
        {
          subjectId: "sub1",
          subjectName: "Mathematics",
          exams: [{ examId: "ex2", name: "Exam 2", rawScore: 50, isAbsent: false, classAverageScore: null, bestScore: null, worstScore: null }],
          subjectExamAverage: 50,
          subjectExamGrade: null,
          classAverageScore: null,
        },
      ],
      termExamAverage: null,
      termExamGrade: null,
      termExamPosition: null,
      status: null,
      classAverageScore: null,
    };

    const rows = buildGradesBySubject(reportCard, currentTermExams);

    // Mathematics (Exam only) before Physics (Evaluation, then Exam) —
    // subject name first, then Evaluation < Exam within the same subject.
    expect(rows.map((r) => r.key)).toEqual(["exam:ex2", "eval:e1", "exam:ex1"]);
  });

  it("returns [] when there is nothing to show, never throws on undefined inputs", () => {
    expect(buildGradesBySubject(undefined, undefined)).toEqual([]);
    expect(buildGradesBySubject(BASE_REPORT_CARD, undefined)).toEqual([]);
  });

  it("a subject with an absent-only evaluation still surfaces it (isAbsent true, rawScore null) — never silently dropped", () => {
    const reportCard: ReportCardResponse = {
      ...BASE_REPORT_CARD,
      subjects: [
        {
          subjectId: "sub1",
          subjectName: "Mathematics",
          needsTeacherAssignment: false,
          evaluations: [{ evaluationId: "e1", name: "CA 1", description: "d", rawScore: null, isAbsent: true, classAverageScore: null, bestScore: null, worstScore: null }],
          totalScore: 0,
          autoGrade: null,
          overrideGrade: null,
          finalGrade: null,
          subjectPosition: null,
          status: "PUBLISHED",
          classAverageScore: null,
        },
      ],
    };

    const rows = buildGradesBySubject(reportCard, undefined);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ isAbsent: true, rawScore: null });
  });
});
