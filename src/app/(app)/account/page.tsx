import type { Metadata } from "next";
import Link from "next/link";
import { ChangePasswordForm } from "@/components/account/change-password-form";
import { InvitationButtons } from "@/components/account/invitation-buttons";
import { CountBadge } from "@/components/app/count-badge";
import { LeaveProjectButton } from "@/components/account/leave-project-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";
import { roleLabels } from "@/lib/permissions";
import { requireUser } from "@/server/auth/session";
import { listMyInvitations, type MyInvitation } from "@/server/queries/members";
import { listMyProjectsOnce, type ProjectSummary } from "@/server/queries/projects";
import { projectHref } from "@/lib/routes";

export const metadata: Metadata = { title: "My account · LoopCheck" };

/** REQ-ACC-01…03. Administration (admins only) comes in step 8. */
export default async function AccountPage() {
  const user = await requireUser();
  const [projects, invitations] = await Promise.all([
    listMyProjectsOnce(user.id),
    listMyInvitations(user.email),
  ]);
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
        <Card id="invitations" className="scroll-mt-16 lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Invitations
              <CountBadge count={invitations.length} label="pending invitations" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InvitationList invitations={invitations} />
          </CardContent>
        </Card>

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
          <Link href={projectHref(p.id)} className="min-w-0 flex-1 hover:underline">
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

/** Pending invitations (REQ-ACC-02); dates in each project's format (REQ-UI-05). */
function InvitationList({ invitations }: { invitations: MyInvitation[] }) {
  if (invitations.length === 0) {
    return <p className="text-muted-foreground text-sm">No pending invitations.</p>;
  }
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-2">
      {invitations.map((i) => (
        <li
          key={i.id}
          aria-label={`Invitation to ${i.clientName} ${i.code}`}
          className="ring-foreground/10 grid gap-2 rounded-lg p-3 ring-1"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium">{i.clientName}</p>
              <p className="text-muted-foreground font-mono text-xs">{i.code}</p>
            </div>
            <Badge variant="secondary">{roleLabels[i.role]}</Badge>
          </div>
          <p className="text-muted-foreground text-xs">
            Invited by {i.invitedBy} on {formatDate(i.createdAt, i)}
          </p>
          <InvitationButtons invitationId={i.id} project={`${i.clientName} ${i.code}`} />
        </li>
      ))}
    </ul>
  );
}
