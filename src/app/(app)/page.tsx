import type { Metadata } from "next";
import { ProjectGrid } from "@/components/app/project-grid";
import { NewProjectDialog } from "@/components/project/new-project-dialog";
import { requireUser } from "@/server/auth/session";
import { listMyProjectsOnce } from "@/server/queries/projects";

export const metadata: Metadata = { title: "Projects · LoopCheck" };

/** Home after sign-in: the user's projects as cards (REQ-UI-02). */
export default async function ProjectsPage() {
  const user = await requireUser();
  const projects = await listMyProjectsOnce(user.id);

  return (
    <section className="grid gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Projects</h2>
        <NewProjectDialog />
      </div>
      {projects.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No projects yet. Create one, or ask a project owner to invite you.
        </p>
      ) : (
        <ProjectGrid projects={projects} />
      )}
    </section>
  );
}
