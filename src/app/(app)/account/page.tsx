import type { Metadata } from "next";
import Link from "next/link";
import { ChangePasswordForm } from "@/components/account/change-password-form";
import { LeaveProjectButton } from "@/components/account/leave-project-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { roleLabels } from "@/lib/permissions";
import { requireUser } from "@/server/auth/session";
import { listMyProjectsOnce, type ProjectSummary } from "@/server/queries/projects";

export const metadata: Metadata = { title: "My account · LoopCheck" };

/** REQ-ACC-01, REQ-ACC-03. Invitations (step 7) and Administration (step 8) come later. */
export default async function AccountPage() {
  const user = await requireUser();
  const projects = await listMyProjectsOnce(user.id);
  const owned = projects.filter((p) => p.role === "owner");
  const joined = projects.filter((p) => p.role !== "owner");

  return (
    <div className="grid max-w-5xl gap-4">
      <div>
        <h2 className="text-lg font-semibold">
          {user.firstName} {user.lastName}
        </h2>
        <p className="text-muted-foreground text-sm">{user.email}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Projects you own</CardTitle>
          </CardHeader>
          <CardContent>
            <ProjectList projects={owned} empty="You do not own any project." />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Projects you joined</CardTitle>
          </CardHeader>
          <CardContent>
            <ProjectList projects={joined} empty="You are not a member of any other project." />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Change password</CardTitle>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ProjectList({ projects, empty }: { projects: ProjectSummary[]; empty: string }) {
  if (projects.length === 0) return <p className="text-muted-foreground text-sm">{empty}</p>;
  return (
    <ul className="divide-y">
      {projects.map((p) => (
        <li key={p.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
          <Link href={`/projects/${p.id}`} className="min-w-0 flex-1 hover:underline">
            <span className="truncate">{p.clientName}</span>{" "}
            <span className="text-muted-foreground font-mono text-xs">{p.code}</span>
          </Link>
          {p.role !== "owner" && (
            <>
              <Badge variant="secondary">{roleLabels[p.role]}</Badge>
              <LeaveProjectButton projectId={p.id} label={`${p.clientName} ${p.code}`} />
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
