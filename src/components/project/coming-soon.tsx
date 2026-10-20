/** Placeholder for tabs built in later deliveries. */
export function ComingSoon({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="text-muted-foreground grid place-items-center gap-1 rounded-xl border border-dashed py-16 text-center text-sm">
      <p className="text-foreground font-medium">{title}</p>
      <p>{children ?? "Coming soon."}</p>
    </div>
  );
}
