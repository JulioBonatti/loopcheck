import type { Metadata } from "next";
import { ProjectCard } from "@/components/app/project-card";
import { requireUser } from "@/server/auth/session";
import { listMyProjectsOnce } from "@/server/queries/projects";

export const metadata: Metadata = { title: "Projects · LoopCheck" };

/** Home after sign-in: the user's projects as cards (REQ-UI-02). */
export default async function ProjectsPage() {
  const user = await requireUser();
  const projects = await listMyProjectsOnce(user.id);

  return (
    <section className="grid gap-4">
      <h2 className="text-lg font-semibold">Projects</h2>
      {projects.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No projects yet. Ask a project owner to invite you.
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
