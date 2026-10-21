import { SettingsTabs } from "@/components/settings/settings-tabs";
import { requireUser } from "@/server/auth/session";
import { requireSettingsProject } from "@/server/queries/projects";

/**
 * Project settings (SPEC §7.6), in sections. Owner and member edit; viewers
 * do not see the tab and get "not found" here.
 */
export default async function SettingsLayout({
  children,
  params,
}: LayoutProps<"/projects/[projectId]/settings">) {
  const { projectId } = await params;
  const user = await requireUser();
  const project = await requireSettingsProject(user.id, projectId);

  return (
    <>
      <SettingsTabs projectId={project.id} />
      {children}
    </>
  );
}
