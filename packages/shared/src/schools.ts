import { z } from "zod";

export interface SchoolSearchResult {
  id: string;
  name: string;
  slug: string;
}

// PATCH /schools/:id, PROPRIETOR/SCHOOL_ADMIN path (v0.2 §2 RBAC split) —
// name/address/phone/email only; slug/type/status are SUPER_ADMIN-only
// fields not accepted on this path at all (400 if sent).
export const updateSchoolSchema = z.object({
  name: z.string().min(1, "School name is required"),
  address: z.string().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  email: z.string().email("Enter a valid email address").optional().or(z.literal("")),
});
export type UpdateSchoolInput = z.infer<typeof updateSchoolSchema>;
