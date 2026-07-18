import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { Paginated, PersonnelSummary, TeacherDetail } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export interface TeachersListParams {
  page: number;
  pageSize: number;
  search: string;
}

export function useTeachers(params: TeachersListParams) {
  return useQuery({
    queryKey: ["teachers", params],
    queryFn: () =>
      apiRequest<Paginated<PersonnelSummary>>("/api/v1/teachers", {
        query: { page: params.page, pageSize: params.pageSize, search: params.search || undefined },
      }),
    placeholderData: keepPreviousData,
  });
}

export function useTeacher(userId: string | undefined) {
  return useQuery({
    queryKey: ["teachers", "detail", userId],
    queryFn: () => apiRequest<TeacherDetail>(`/api/v1/teachers/${userId}`),
    enabled: Boolean(userId),
  });
}
