import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { Paginated, StudentListItem, StudentStatus } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export interface StudentsListParams {
  page: number;
  pageSize: number;
  search: string;
  classArmId?: string;
  status?: StudentStatus;
}

export function useStudents(params: StudentsListParams) {
  return useQuery({
    queryKey: ["students", params],
    queryFn: () =>
      apiRequest<Paginated<StudentListItem>>("/api/v1/students", {
        query: {
          page: params.page,
          pageSize: params.pageSize,
          search: params.search || undefined,
          classArmId: params.classArmId,
          status: params.status,
        },
      }),
    // Keeps the current page's rows visible while the next page loads,
    // instead of flashing the loading skeleton on every click — matters at
    // ~100 rows/5 pages (JSS 2 A) where users will page through repeatedly.
    placeholderData: keepPreviousData,
  });
}
