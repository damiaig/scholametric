import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreatePersonnelInput,
  JobTitleValue,
  Paginated,
  PersonnelRole,
  PersonnelSummary,
  ResetPasswordResponse,
  UpdatePersonnelInput,
} from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";
import { normalizeOptionalString } from "../../lib/normalize-optional";

export interface PersonnelListParams {
  page: number;
  pageSize: number;
  search: string;
  role?: PersonnelRole;
  jobTitle?: JobTitleValue;
}

export function usePersonnel(params: PersonnelListParams) {
  return useQuery({
    queryKey: ["personnel", params],
    queryFn: () =>
      apiRequest<Paginated<PersonnelSummary>>("/api/v1/personnel", {
        query: {
          page: params.page,
          pageSize: params.pageSize,
          search: params.search || undefined,
          role: params.role,
          jobTitle: params.jobTitle,
        },
      }),
    placeholderData: keepPreviousData,
  });
}

export function useCreatePersonnel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePersonnelInput) =>
      apiRequest<PersonnelSummary>("/api/v1/personnel", {
        method: "POST",
        body: {
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
          role: input.role,
          jobTitle: input.jobTitle,
          phone: normalizeOptionalString(input.phone),
          qualification: normalizeOptionalString(input.qualification),
          dateEmployed: normalizeOptionalString(input.dateEmployed),
          password: input.password,
        },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["personnel"] }),
  });
}

export function useUpdatePersonnel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePersonnelInput }) =>
      apiRequest<PersonnelSummary>(`/api/v1/personnel/${id}`, {
        method: "PATCH",
        body: {
          firstName: input.firstName,
          lastName: input.lastName,
          role: input.role,
          jobTitle: input.jobTitle,
          phone: normalizeOptionalString(input.phone),
          qualification: normalizeOptionalString(input.qualification),
          status: input.status,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["personnel"] });
      queryClient.invalidateQueries({ queryKey: ["teachers"] });
    },
  });
}

export function useResetPersonnelPassword() {
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<ResetPasswordResponse>(`/api/v1/personnel/${id}/reset-password`, { method: "POST" }),
  });
}
