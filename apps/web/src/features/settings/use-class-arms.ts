import { keepPreviousData, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ClassArm, CreateClassArmInput, Paginated, UpdateClassArmInput } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export function useClassArmsList(classLevelId: string | undefined, page: number, pageSize = 20) {
  return useQuery({
    queryKey: ["class-arms", classLevelId, { page, pageSize }],
    queryFn: () =>
      apiRequest<Paginated<ClassArm>>("/api/v1/class-arms", { query: { classLevelId, page, pageSize } }),
    enabled: Boolean(classLevelId),
    placeholderData: keepPreviousData,
  });
}

export function useCreateClassArm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateClassArmInput) =>
      apiRequest<ClassArm>("/api/v1/class-arms", { method: "POST", body: input }),
    onSuccess: (data) => queryClient.invalidateQueries({ queryKey: ["class-arms", data.classLevelId] }),
  });
}

export function useUpdateClassArm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateClassArmInput }) =>
      apiRequest<ClassArm>(`/api/v1/class-arms/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["class-arms"] }),
  });
}
