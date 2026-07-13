import { keepPreviousData, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CreateUserInput,
  CreateUserResponse,
  Paginated,
  ResetPasswordResponse,
  StaffRole,
  StaffUser,
  UpdateUserInput,
} from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export interface StaffListParams {
  page: number;
  pageSize: number;
  search: string;
  role?: StaffRole;
}

export function useStaffUsers(params: StaffListParams) {
  return useQuery({
    queryKey: ["users", params],
    queryFn: () =>
      apiRequest<Paginated<StaffUser>>("/api/v1/users", {
        query: {
          page: params.page,
          pageSize: params.pageSize,
          search: params.search || undefined,
          role: params.role,
        },
      }),
    placeholderData: keepPreviousData,
  });
}

export function useCreateStaffUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) =>
      apiRequest<CreateUserResponse>("/api/v1/users", { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useUpdateStaffUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUserInput }) =>
      apiRequest<StaffUser>(`/api/v1/users/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useResetStaffPassword() {
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<ResetPasswordResponse>(`/api/v1/users/${id}/reset-password`, { method: "POST" }),
  });
}
