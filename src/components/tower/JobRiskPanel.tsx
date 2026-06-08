import { useSim } from "@/lib/simulation/store";
import { riskBand, priorityColor } from "@/lib/simulation/format";

export function JobRiskPanel() {
  const { jobs, tick, selectJob, selectedJob, systemMode } = useSim();
  const active = jobs
    .filter((j) => j.status !== "completed" && j.status !== "breached")
    .sort((a, b) => b.riskScore - a.riskScore);

  return (
    <div className="panel rounded-md flex flex-col h-full overflow-hidden">
      <div className="panel-header px-3 py-2 flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-widest font-mono">Job Risk & Business Impact</span>
        <span className="ml-auto text-[10px] font-mono text-muted-foreground">{active.length} open</span>
      </div>
      <div className="flex-1 overflow-auto p-2 space-y-1.5">
        {active.map((j) => {
          const band = riskBand(j.riskScore);
          const slaTicks = j.slaDeadlineTick - tick;
          const slaMin = slaTicks * 3;
          const selected = selectedJob === j.id;
          return (
            <button
              key={j.id}
              onClick={() => selectJob(j.id)}
              className={`w-full text-left rounded border p-2 transition-all ${
                selected ? "border-primary" : "border-panel-border bg-background/40 hover:bg-background/60"
              }`}
              style={{ borderLeftWidth: 3, borderLeftColor: band.color }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-xs font-bold">{j.id}</span>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: priorityColor(j.priority) }} />
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{j.priority}</span>
                {!j.assignedEngineer && (
                  <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded bg-status-warn/15 text-status-warn">
                    {systemMode === "manual" ? "Awaiting dispatch" : "Unassigned · no capacity"}
                  </span>
                )}
                <span className="ml-auto text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: band.bg, color: band.color }}>
                  {band.label}
                </span>
              </div>
              <div className="text-xs text-foreground/90 truncate">{j.title}</div>
              <div className="text-[10px] text-muted-foreground truncate font-mono">{j.customer}</div>
              <div className="grid grid-cols-4 gap-2 mt-1.5 text-[9px] font-mono">
                <Stat label="SLA" value={slaMin > 0 ? `${slaMin}m` : "BREACH"} color={slaMin < 15 ? "var(--color-status-crit)" : undefined} />
                <Stat label="Risk" value={String(j.riskScore)} color={band.color} />
                <Stat label="Rev" value={`£${j.revenue}`} />
                <Stat label="FTF" value={`${j.firstTimeFix}%`} />
              </div>
              <div className="h-1 bg-secondary rounded overflow-hidden mt-1.5">
                <div className="h-full bg-status-info transition-all" style={{ width: `${j.progress}%` }} />
              </div>
            </button>
          );
        })}
        {active.length === 0 && <div className="text-center text-xs text-muted-foreground py-6 font-mono">No active jobs</div>}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="text-center">
      <div className="text-[8px] uppercase opacity-60">{label}</div>
      <div className="font-bold" style={{ color: color ?? "var(--color-foreground)" }}>{value}</div>
    </div>
  );
}
