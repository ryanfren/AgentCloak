const styles = {
  active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  revoked: "bg-red-500/10 text-red-400 border-red-500/20",
  error: "bg-amber-500/10 text-amber-400 border-amber-500/20",
} as const;

export function StatusBadge({
  status,
}: {
  status: "active" | "revoked" | "error";
}) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {status}
    </span>
  );
}
