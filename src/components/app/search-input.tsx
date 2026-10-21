import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "cn";

/** A filter box with a search icon; `label` is its accessible name. */
export function SearchInput({
  label,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & { label: string }) {
  return (
    <div className={cn("relative", className)}>
      <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
      <Input type="search" aria-label={label} className="pl-8" {...props} />
    </div>
  );
}
