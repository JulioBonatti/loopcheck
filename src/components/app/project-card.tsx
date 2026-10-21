import Link from "next/link";
import { roleLabels } from "@/lib/permissions";
import { formatPercent, ratio } from "@/lib/metrics";
import { Badge } from "@/components/ui/badge";
import type { ProjectSummary } from "@/server/queries/projects";

/** One project in the list (REQ-UI-02): opens straight on the Loop check tab. */
export function ProjectCard({ project }: { project: ProjectSummary }) {
  const { countableTags, checkedOutTags } = project;
  const done = ratio(checkedOutTags, countableTags);

  return (
    <Link
      href={`/projects/${project.id}`}
      className="bg-card ring-foreground/10 hover:ring-foreground/25 focus-visible:ring-ring group grid gap-3 rounded-xl p-4 ring-1 transition-shadow outline-none hover:shadow-sm focus-visible:ring-2"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{project.clientName}</h3>
          <p className="text-muted-foreground font-mono text-xs">{project.code}</p>
        </div>
        <Badge variant={project.role === "owner" ? "default" : "secondary"}>
          {roleLabels[project.role]}
        </Badge>
      </div>

      <div className="grid gap-1.5">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-muted-foreground">OK</span>
          <span className="font-semibold tabular-nums">
            {formatPercent(checkedOutTags, countableTags)}
          </span>
        </div>
        <div
          className="bg-muted h-1.5 overflow-hidden rounded-full"
          role="progressbar"
          aria-label="Tags checked out"
          aria-valuemin={0}
          aria-valuemax={countableTags}
          aria-valuenow={checkedOutTags}
        >
          <div
            className="bg-primary h-full rounded-full"
            style={{ width: `${(done ?? 0) * 100}%` }}
          />
        </div>
        <p className="text-muted-foreground text-xs tabular-nums">
          {countableTags === 0
            ? "No tags to check yet"
            : `${checkedOutTags} of ${countableTags} tags checked out`}
        </p>
      </div>

      <p className="text-muted-foreground border-t pt-2 text-xs">
        {project.revisionName ? `IO list: ${project.revisionName}` : "No IO list imported"}
      </p>
    </Link>
  );
}
