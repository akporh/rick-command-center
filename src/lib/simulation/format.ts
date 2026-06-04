export function severityColor(sev: "info" | "warn" | "risk" | "crit" | "ok") {
  switch (sev) {
    case "ok": return "var(--color-status-ok)";
    case "warn": return "var(--color-status-warn)";
    case "risk": return "var(--color-status-risk)";
    case "crit": return "var(--color-status-crit)";
    default: return "var(--color-status-info)";
  }
}

export function riskBand(score: number): { label: string; color: string; bg: string } {
  if (score >= 85) return { label: "CRITICAL", color: "var(--color-status-crit)", bg: "oklch(0.66 0.25 25 / 0.18)" };
  if (score >= 60) return { label: "AT RISK", color: "var(--color-status-risk)", bg: "oklch(0.74 0.20 45 / 0.18)" };
  if (score >= 35) return { label: "WATCH", color: "var(--color-status-warn)", bg: "oklch(0.82 0.16 85 / 0.15)" };
  return { label: "SAFE", color: "var(--color-status-ok)", bg: "oklch(0.78 0.17 155 / 0.15)" };
}

export function priorityColor(p: "low" | "medium" | "high" | "critical") {
  return p === "critical"
    ? "var(--color-status-crit)"
    : p === "high"
    ? "var(--color-status-risk)"
    : p === "medium"
    ? "var(--color-status-warn)"
    : "var(--color-status-idle)";
}

export function fmtTime(simMinutes: number) {
  const total = 8 * 60 + simMinutes;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function statusLabel(s: string) {
  return s.replace(/_/g, " ").toUpperCase();
}
