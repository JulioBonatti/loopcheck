import { describe, expect, it } from "vitest";
import { type ProjectPermission, type ProjectRole, roleCan } from "@/lib/permissions";

// SPEC §5.3, column by column: [owner, member, viewer]
const matrix: Record<ProjectPermission, [boolean, boolean, boolean]> = {
  "project.view": [true, true, true],
  "tag.checkout": [true, true, false],
  "issue.edit": [true, true, false],
  "iolist.edit": [true, true, false],
  "iolist.export": [true, true, true],
  "iolist.clear": [true, false, false],
  "settings.edit": [true, true, false],
  "members.manage": [true, false, false],
  "report.generate": [true, true, false],
  "report.view": [true, true, true],
  "project.delete": [true, false, false],
  "project.leave": [false, true, true],
};

const roles: ProjectRole[] = ["owner", "member", "viewer"];

describe("roleCan (SPEC §5.3)", () => {
  for (const [permission, expected] of Object.entries(matrix)) {
    it(permission, () => {
      expect(roles.map((role) => roleCan(role, permission as ProjectPermission))).toEqual(expected);
    });
  }
});
