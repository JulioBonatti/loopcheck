import { revalidatePath } from "next/cache";

/**
 * Layouts (the header's "Recent" project) and pages are kept across
 * navigations: actions that change the user's projects refresh them all.
 * (A plain module, not "use server": it must not be callable from the browser.)
 */
export function refreshProjectLists(): void {
  revalidatePath("/", "layout");
}
