/**
 * Permission matrix (SPEC §5.3) for project roles. Pure, so the UI can use it
 * to hide controls (REQ-PERM-02); the server enforces it in the service layer
 * (REQ-PERM-01). Admin-only actions are not here: they check `users.is_admin`.
 */

export const projectRoles = ["owner", "member", "viewer"] as const;
export type ProjectRole = (typeof projectRoles)[number];

const ALL: readonly ProjectRole[] = ["owner", "member", "viewer"];
const EDITORS: readonly ProjectRole[] = ["owner", "member"];
const OWNER: readonly ProjectRole[] = ["owner"];

export const projectPermissions = {
  /** See the project tabs (read-only for viewers). */
  "project.view": ALL,
  /** Checkout / uncheck. */
  "tag.checkout": EDITORS,
  /** Open, edit and resolve issues. */
  "issue.edit": EDITORS,
  /** Import, update and edit the IO list. */
  "iolist.edit": EDITORS,
  "iolist.export": ALL,
  /** Clear the IO list / restore a cleared IO list. */
  "iolist.clear": OWNER,
  /** Fields, issue types, presets, procedures, logos, dates, time zone, format. */
  "settings.edit": EDITORS,
  /** Invite, change roles, remove members. */
  "members.manage": OWNER,
  "report.generate": EDITORS,
  /** See charts and download generated PDFs. */
  "report.view": ALL,
  /** Move the project to the trash. */
  "project.delete": OWNER,
  /** The owner must hand the project over first. */
  "project.leave": ["member", "viewer"],
} as const satisfies Record<string, readonly ProjectRole[]>;

export type ProjectPermission = keyof typeof projectPermissions;

export function roleCan(role: ProjectRole, permission: ProjectPermission): boolean {
  return (projectPermissions[permission] as readonly ProjectRole[]).includes(role);
}
