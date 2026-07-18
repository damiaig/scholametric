import { useCurrentUser } from "../shell/use-current-user";
import { isSchoolAdmin } from "../../lib/roles";

/**
 * PROPRIETOR/SCHOOL_ADMIN have full student-mutation access; TEACHER is
 * read-only; SUPER_ADMIN has no school-student access at all (403s
 * server-side). Defaults to false while /auth/me is still loading —
 * mutation buttons must never flash visible before the role is confirmed.
 */
export function useCanManageStudents(): boolean {
  const { data: user } = useCurrentUser();
  return isSchoolAdmin(user?.role);
}
