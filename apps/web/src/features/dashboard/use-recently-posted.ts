import { useQueries } from "@tanstack/react-query";
import type { ClassArmResultsResponse, EvaluationsListResponse, ExamsListResponse, MyTeaching } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";
import { evaluationsQueryKey } from "../grades/use-evaluations";
import { examsQueryKey } from "../grades/use-exams";
import { classArmResultsQueryKey } from "../grades/use-class-arm-results";

export type SubjectPublishState = "PUBLISHED" | "DRAFT" | "UNKNOWN";

export interface RecentlyPostedItem {
  key: string;
  name: string;
  subjectName: string;
  className: string;
  type: "Evaluation" | "Exam";
  createdAt: string;
  subjectStatus: SubjectPublishState;
}

const MAX_ITEMS = 5;

// v0.7.1 step 3 (SPEC_V0.7.1.md §6 step 3) — "Recently posted" fans out over
// EXISTING endpoints only: GET /grades/evaluations and GET /exams (both
// already used by EvaluationPicker/ExamPicker, both carry a real createdAt —
// unlike the report-card-scoped types Step 2 ran into) once per subject
// assignment, plus GET /class-arms/:id/results once per distinct class arm
// to derive a SUBJECT-level publish-state approximation (neither Evaluation
// nor Exam carries a status field of its own — see docs/DECISIONS.md). This
// is a bounded fan-out (bounded by the teacher's own class/subject count,
// never school-wide), not a new endpoint.
export function useRecentlyPosted(teaching: MyTeaching | undefined) {
  const termId = teaching?.currentTermId ?? null;
  const subjects = teaching?.subjects ?? [];
  const hasTerm = Boolean(termId);

  const evaluationQueries = useQueries({
    queries: subjects.map((s) => ({
      queryKey: termId
        ? evaluationsQueryKey({ classArmId: s.classArmId, subjectId: s.subjectId, termId })
        : (["grades", "evaluations", "disabled", s.id] as const),
      queryFn: () =>
        apiRequest<EvaluationsListResponse>("/api/v1/grades/evaluations", {
          query: { classArmId: s.classArmId, subjectId: s.subjectId, termId: termId as string },
        }),
      enabled: hasTerm,
    })),
  });

  const examQueries = useQueries({
    queries: subjects.map((s) => ({
      queryKey: termId
        ? examsQueryKey({ classArmId: s.classArmId, subjectId: s.subjectId, termId })
        : (["exams", "list", "disabled", s.id] as const),
      queryFn: () =>
        apiRequest<ExamsListResponse>("/api/v1/exams", {
          query: { classArmId: s.classArmId, subjectId: s.subjectId, termId: termId as string },
        }),
      enabled: hasTerm,
    })),
  });

  const distinctClassArmIds = Array.from(new Set(subjects.map((s) => s.classArmId)));
  const resultsQueries = useQueries({
    queries: distinctClassArmIds.map((classArmId) => ({
      queryKey: termId
        ? classArmResultsQueryKey({ classArmId, termId })
        : (["grades", "class-arm-results", "disabled", classArmId] as const),
      queryFn: () =>
        apiRequest<ClassArmResultsResponse>(`/api/v1/class-arms/${classArmId}/results`, {
          query: { termId: termId as string },
        }),
      enabled: hasTerm,
    })),
  });

  const isLoading =
    hasTerm &&
    (evaluationQueries.some((q) => q.isLoading) || examQueries.some((q) => q.isLoading) || resultsQueries.some((q) => q.isLoading));
  const isError =
    evaluationQueries.some((q) => q.isError) || examQueries.some((q) => q.isError) || resultsQueries.some((q) => q.isError);

  const statusByArm = new Map<string, ClassArmResultsResponse>();
  distinctClassArmIds.forEach((armId, index) => {
    const data = resultsQueries[index]?.data;
    if (data) {
      statusByArm.set(armId, data);
    }
  });

  function subjectStatusFor(classArmId: string, subjectId: string): SubjectPublishState {
    const results = statusByArm.get(classArmId);
    const subject = results?.subjects.find((entry) => entry.subjectId === subjectId);
    if (!subject) {
      return "UNKNOWN";
    }
    return subject.results.length > 0 && subject.results.every((row) => row.status === "PUBLISHED") ? "PUBLISHED" : "DRAFT";
  }

  const rows: RecentlyPostedItem[] = [];
  subjects.forEach((s, index) => {
    const evaluations = evaluationQueries[index]?.data;
    evaluations?.evaluations.forEach((evaluation) => {
      rows.push({
        key: `evaluation-${evaluation.id}`,
        name: evaluation.name,
        subjectName: s.subjectName,
        className: s.className,
        type: "Evaluation",
        createdAt: evaluation.createdAt,
        subjectStatus: subjectStatusFor(s.classArmId, s.subjectId),
      });
    });
    const exams = examQueries[index]?.data;
    exams?.exams.forEach((exam) => {
      rows.push({
        key: `exam-${exam.id}`,
        name: exam.name,
        subjectName: s.subjectName,
        className: s.className,
        type: "Exam",
        createdAt: exam.createdAt,
        subjectStatus: subjectStatusFor(s.classArmId, s.subjectId),
      });
    });
  });

  rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return { items: rows.slice(0, MAX_ITEMS), isLoading, isError, hasTerm };
}
