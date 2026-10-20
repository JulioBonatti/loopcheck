import Link from "next/link";

/** Unknown id, project in the trash or not a member: all look the same. */
export default function ProjectNotFound() {
  return (
    <div className="grid justify-items-start gap-2">
      <h2 className="text-lg font-semibold">Project not found</h2>
      <p className="text-muted-foreground text-sm">
        It may have been deleted, or you are not a member of it.
      </p>
      <Link href="/" className="text-sm underline underline-offset-4">
        Back to projects
      </Link>
    </div>
  );
}
