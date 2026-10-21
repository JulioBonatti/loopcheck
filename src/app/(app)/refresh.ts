import { revalidatePath } from "next/cache";

/**
 * The header menu lists the user's projects, and layouts are kept across
 * navigations: actions that change the list must refresh every layout.
 * (A plain module, not "use server": it must not be callable from the browser.)
 */
export function refreshProjectLists(): void {
  revalidatePath("/", "layout");
}
