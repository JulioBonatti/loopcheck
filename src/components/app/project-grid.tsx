"use client";

import { useDeferredValue, useState } from "react";
import { textMatcher } from "@/lib/search";
import type { ProjectSummary } from "@/server/queries/projects";
import { ProjectCard } from "./project-card";
import { SearchInput } from "./search-input";

/** The project cards, with a filter by client name or project code. */
export function ProjectGrid({ projects }: { projects: ProjectSummary[] }) {
  const [query, setQuery] = useState("");
  const matches = textMatcher(useDeferredValue(query));
  const shown = projects.filter((p) => matches(`${p.clientName} ${p.code}`));

  return (
    <div className="grid gap-3">
      <SearchInput
        label="Filter projects"
        placeholder="Filter by client or code…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-sm"
      />
      {shown.length === 0 ? (
        <p className="text-muted-foreground text-sm">No projects match “{query}”.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-3">
          {shown.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </div>
  );
}
