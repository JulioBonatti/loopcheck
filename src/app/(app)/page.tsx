import { MailIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CountBadge } from "@/components/app/count-badge";
import { ProjectGrid } from "@/components/app/project-grid";
import { NewProjectDialog } from "@/components/project/new-project-dialog";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/server/auth/session";
import { countMyInvitations } from "@/server/queries/members";
import { listMyProjectsOnce } from "@/server/queries/projects";

export const metadata: Metadata = { title: "Projects · LoopCheck" };

/** Home after sign-in: the user's projects as cards (REQ-UI-02). */
export default async function ProjectsPage() {
  const user = await requireUser();
  const [projects, invitationCount] = await Promise.all([
    listMyProjectsOnce(user.id),
    countMyInvitations(user.email),
  ]);

  return (
    <section className="grid gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Projects</h2>
        <div className="flex items-center gap-2">
          <Link href="/account#invitations" className={buttonVariants({ variant: "outline" })}>
            <MailIcon />
            Invitations
            <CountBadge count={invitationCount} label="pending invitations" />
          </Link>
          <NewProjectDialog />
        </div>
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
