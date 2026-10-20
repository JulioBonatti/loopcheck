"use client";

import { createContext, use, useMemo } from "react";
import {
  type DateFormat,
  formatDate,
  formatDateTime,
  type IsoDate,
  type ProjectDateSettings,
} from "@/lib/dates";
import type { ProjectRole } from "@/lib/permissions";

export type ProjectContextValue = {
  id: string;
  code: string;
  role: ProjectRole;
  timezone: string;
  dateFormat: DateFormat;
};

const ProjectContext = createContext<ProjectContextValue | null>(null);

/** Gives the project's pages its id, the user's role and its date settings. */
export function ProjectProvider({
  value,
  children,
}: {
  value: ProjectContextValue;
  children: React.ReactNode;
}) {
  return <ProjectContext value={value}>{children}</ProjectContext>;
}

export function useProject(): ProjectContextValue {
  const project = use(ProjectContext);
  if (!project) throw new Error("useProject must be used inside a project page");
  return project;
}

/** Dates in the project time zone and format (REQ-UI-05). */
export function useProjectDates() {
  const { timezone, dateFormat } = useProject();
  return useMemo(() => {
    const settings: ProjectDateSettings = { timezone, dateFormat };
    return {
      date: (value: Date | IsoDate) => formatDate(value, settings),
      dateTime: (value: Date) => formatDateTime(value, settings),
    };
  }, [timezone, dateFormat]);
}
