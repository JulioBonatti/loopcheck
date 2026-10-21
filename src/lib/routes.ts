/** Project URLs. Tabs are URL segments (REQ-UI-03). */

export const projectTabs = ["loop-check", "io-list", "reports", "settings"] as const;
export type ProjectTab = (typeof projectTabs)[number];

/**
 * A project page. Links go straight to a tab: `/projects/<id>` only
 * redirects, which costs a round trip (and trips a React dev-mode bug).
 */
export function projectHref(projectId: string, tab: ProjectTab = "loop-check"): string {
  return `/projects/${projectId}/${tab}`;
}
