import { roleLabels } from "@/lib/permissions";

/** Roles an owner can give (ownership moves only by admin transfer). */
export const ASSIGNABLE_ROLES = [
  { value: "member", label: roleLabels.member },
  { value: "viewer", label: roleLabels.viewer },
];
