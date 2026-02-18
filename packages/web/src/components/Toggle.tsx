import { Info } from "lucide-react";

export function Toggle({
  enabled,
  onChange,
  label,
  description,
  onInfo,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  label: string;
  description?: string;
  onInfo?: () => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 py-2">
      <div>
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-zinc-200">{label}</span>
          {onInfo && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onInfo();
              }}
              className="rounded p-0.5 text-zinc-600 hover:text-zinc-400"
              aria-label={`More info about ${label}`}
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {description && (
          <div className="text-xs text-zinc-500">{description}</div>
        )}
      </div>
      <button
        role="switch"
        aria-checked={enabled}
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
          enabled ? "bg-emerald-500" : "bg-zinc-700"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            enabled ? "translate-x-4.5" : "translate-x-0.5"
          } mt-0.5`}
        />
      </button>
    </label>
  );
}
