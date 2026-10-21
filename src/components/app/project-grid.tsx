"use client";

import { SearchIcon } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { Input } from "@/components/ui/input";
import type { ProjectSummary } from "@/server/queries/projects";
import { ProjectCard } from "./project-card";

/** Case- and accent-insensitive text for matching. */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** The project cards, with a filter by client name or project code. */
export function ProjectGrid({ projects }: { projects: ProjectSummary[] }) {
  const [query, setQuery] = useState("");
  const terms = normalize(useDeferredValue(query)).split(/\s+/).filter(Boolean);
  const shown = projects.filter((p) => {
    const text = normalize(`${p.clientName} ${p.code}`);
    return terms.every((t) => text.includes(t));
  });

  return (
    <div className="grid gap-3">
      <div className="relative max-w-sm">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          type="search"
          aria-label="Filter projects"
          placeholder="Filter by client or code…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8"
        />
      </div>
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
