import { useSim, engineerAvailableMin } from "@/lib/simulation/store";
import { statusLabel } from "@/lib/simulation/format";


const statusColor: Record<string, string> = {
  working: "bg-status-ok",
  en_route: "bg-status-info",
  delayed: "bg-status-crit",
  idle: "bg-status-idle",
  off_shift: "bg-muted-foreground/40",
};

export function EngineerPanel() {
  const { engineers, jobs, traffic, selectEngineer, selectedEngineer } = useSim();

  return (
    <div className="panel rounded-md flex flex-col h-full overflow-hidden">
      <div className="panel-header px-3 py-2 flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-widest font-mono">Field Engineers</span>
        <span className="ml-auto text-[10px] font-mono text-muted-foreground">{engineers.length} units</span>
      </div>
      <div className="flex-1 overflow-auto p-2 grid grid-cols-2 gap-2 content-start">
        {engineers.map((e) => {
          const cur = jobs.find((j) => j.id === e.currentJob);
          const selected = selectedEngineer === e.id;
          const availMin = Math.round(engineerAvailableMin(e, jobs, traffic));
          return (
            <button
              key={e.id}
              onClick={() => selectEngineer(e.id)}
              className={`text-left rounded border p-2 transition-all ${
                selected ? "border-primary bg-primary/5" : "border-panel-border bg-background/40 hover:bg-background/60"
              } ${e.status === "off_shift" ? "opacity-50" : ""}`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-7 h-7 rounded bg-secondary grid place-items-center font-mono font-bold text-xs relative">
                  {e.initials}
                  {e.overtimeWilling && (
                    <span
                      title="Willing to work overtime"
                      className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-status-warn"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-mono truncate flex items-center gap-1">
                    {e.name}
                    {e.overtime && (
                      <span className="text-[8px] font-mono uppercase tracking-widest px-1 py-0.5 rounded bg-status-warn/20 text-status-warn">OT</span>
                    )}
                  </div>
                  <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{e.id} · {e.skills.join(", ")}</div>
                </div>
                <span className={`w-1.5 h-1.5 rounded-full ${statusColor[e.status]} ${e.status === "off_shift" ? "" : "pulse-dot"}`} />
              </div>
              <div className="text-[10px] font-mono text-muted-foreground mb-1">
                <span className="text-foreground/80">{e.status === "off_shift" ? "Off shift" : statusLabel(e.status)}</span>
                {cur && <span> · {cur.id} @ {cur.customer}</span>}
              </div>
              <div className="flex items-center gap-2 text-[9px] font-mono">
                <div className="flex-1">
                  <div className="flex justify-between text-muted-foreground"><span>EFF</span><span>{e.efficiency}</span></div>
                  <div className="h-1 bg-secondary rounded overflow-hidden mt-0.5">
                    <div className="h-full bg-status-info" style={{ width: `${e.efficiency}%` }} />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex justify-between text-muted-foreground"><span>FAT</span><span>{e.fatigue}</span></div>
                  <div className="h-1 bg-secondary rounded overflow-hidden mt-0.5">
                    <div className="h-full bg-status-warn" style={{ width: `${e.fatigue}%` }} />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between text-[9px] font-mono text-muted-foreground mt-1">
                <span>Next free in: <span className="text-foreground/80">{availMin > 0 ? `${availMin}m` : "now"}</span></span>
                {e.nextJobs.length > 0 && <span>+{e.nextJobs.length} queued</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
