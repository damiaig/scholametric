import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SaveEvaluationScoresResponse } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export interface CorrectPublishedScoreInput {
  classArmId: string;
  subjectId: string;
  evaluationId: string;
  termId: string;
  studentId: string;
  rawScore: number | null;
  isAbsent: boolean;
}

// SPEC_V0.5.1.md §2.5, v0.5.1 step 4 — reuses PUT /grades/evaluation-scores
// directly (the exact same reviewed write path the score-entry grid itself
// uses, just a single-item scores[]), not a new endpoint. SCHOOL_ADMIN/
// PROPRIETOR pass the PUBLISHED-student gate there; the result stays
// PUBLISHED with corrected total/grade/position (GradesService.saveEvaluationScores).
export function useCorrectPublishedScore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CorrectPublishedScoreInput) =>
      apiRequest<SaveEvaluationScoresResponse>("/api/v1/grades/evaluation-scores", {
        method: "PUT",
        body: {
          classArmId: input.classArmId,
          subjectId: input.subjectId,
          evaluationId: input.evaluationId,
          termId: input.termId,
          scores: [{ studentId: input.studentId, rawScore: input.rawScore, isAbsent: input.isAbsent }],
        },
      }),
    onSuccess: () => {
      // Same broad-invalidate as override (use-override-grade.ts) — the
      // correction can move subject AND overall positions across the whole
      // class arm, not just this one student's row.
      queryClient.invalidateQueries({ queryKey: ["grades", "review"] });
      queryClient.invalidateQueries({ queryKey: ["grades", "class-arm-results"] });
      queryClient.invalidateQueries({ queryKey: ["grades", "student-results"] });
      queryClient.invalidateQueries({ queryKey: ["grades", "evaluation-scores"] });
    },
  });
}
