import { cn } from "cn";

/** A small counter, e.g. pending invitations (REQ-MEM-05). Hidden at zero. */
export function CountBadge({
  count,
  label,
  className,
}: {
  count: number;
  /** What is being counted, for screen readers ("pending invitations"). */
  label: string;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "bg-primary text-primary-foreground inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-[0.7rem] leading-none font-semibold tabular-nums",
        className,
      )}
      aria-label={`${count} ${label}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
