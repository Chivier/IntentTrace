import type { ReactNode } from "react";

export type StatusTone = "neutral" | "ok" | "warning" | "blocked";

const toneLabels: Record<StatusTone, string> = {
  neutral: "Informational status",
  ok: "Healthy status",
  warning: "Warning status",
  blocked: "Blocked status",
};

export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span className={`status-badge status-badge--${tone}`} aria-label={toneLabels[tone]}>
      {children}
    </span>
  );
}
