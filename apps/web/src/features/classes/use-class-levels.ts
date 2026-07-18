import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ClassLevel, CreateClassLevelInput } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

// The Classes page's only class-level data source is GET /classes (already
// one query, level+arms+teacher+enrollment together) — no separate list
// hook needed here, just the "Add level" mutation.
export function useCreateClassLevel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateClassLevelInput) =>
      apiRequest<ClassLevel>("/api/v1/class-levels", { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["classes"] }),
  });
}
