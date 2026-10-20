import type { Metadata } from "next";
import { ProjectCard } from "@/components/app/project-card";
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
        <div className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </section>
  );
}
