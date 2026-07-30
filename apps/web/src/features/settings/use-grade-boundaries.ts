import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GradeBoundary, GradeBoundaryItemInput, GradingPresets } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export function useGradeBoundaries() {
  return useQuery({
    queryKey: ["grade-boundaries"],
    queryFn: () => apiRequest<GradeBoundary[]>("/api/v1/grade-boundaries"),
  });
}

export function useReplaceGradeBoundaries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: GradeBoundaryItemInput[]) =>
      apiRequest<GradeBoundary[]>("/api/v1/grade-boundaries", {
        method: "PUT",
        body: { boundaries: items },
      }),
    onSuccess: (data) => queryClient.setQueryData(["grade-boundaries"], data),
  });
}

export function useGradingPresets() {
  return useQuery({
    queryKey: ["grading-presets"],
    queryFn: () => apiRequest<GradingPresets>("/api/v1/grading-presets"),
    // Static lookup tables (SPEC_V0.3.md §2, resolution 10) — never change
    // at runtime, no need to ever refetch once loaded.
    staleTime: Infinity,
  });
}
