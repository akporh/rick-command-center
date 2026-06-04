import { createFileRoute } from "@tanstack/react-router";
import { useSim } from "@/lib/simulation/store";

export const Route = createFileRoute("/insights")({
  component: Insights,
});

function Insights() {
  const { metrics, jobs, engineers } = useSim();
  const completed = jobs.filter((j) => j.status === "completed").length;
  const breached = metrics.breached;
  const totalRev = jobs.filter((j) => j.status === "completed").reduce((a, j) => a + j.revenue, 0);
  const exposure = jobs.filter((j) => j.status === "breached").reduce((a, j) => a + j.penalty, 0);
  const aiUplift = Math.max(0, metrics.slaHealth - metrics.manualBaselineSla);

  return (
    <div className="h-[calc(100vh-3.5rem)] overflow-auto p-4 space-y-4">
      <div>
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono">Outcomes</div>
        <h2 className="text-2xl font-mono">AI vs Manual Baseline</h2>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <KPI label="SLA Health" value={`${metrics.slaHealth}%`} sub={`baseline ${metrics.manualBaselineSla}%`} delta={`+${aiUplift}%`} good />
        <KPI label="Jobs Completed" value={String(completed)} sub={`of ${jobs.length}`} />
        <KPI label="SLA Breaches" value={String(breached)} sub={`£${exposure} exposure`} bad={breached > 0} />
        <KPI label="Revenue Secured" value={`£${totalRev.toLocaleString()}`} sub={`+£${metrics.revenueProtected} protected by AI`} good />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="panel rounded-md p-4">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono mb-3">Efficiency Gain</div>
          <div className="space-y-3">
            <Bar label="Travel time saved" value={metrics.travelSavedMin} max={300} unit="min" />
            <Bar label="AI actions accepted" value={metrics.aiAcceptedCount} max={40} unit="" />
            <Bar label="Engineers utilised" value={engineers.filter((e) => e.status !== "idle").length} max={engineers.length} unit={`/${engineers.length}`} />
          </div>
        </div>

        <div className="panel rounded-md p-4">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono mb-3">Engineer Performance</div>
          <div className="space-y-2">
            {engineers.slice().sort((a, b) => b.efficiency - a.efficiency).map((e) => (
              <div key={e.id} className="flex items-center gap-2 text-[11px] font-mono">
                <span className="w-12">{e.id}</span>
                <span className="flex-1 truncate text-muted-foreground">{e.name}</span>
                <div className="w-32 h-1.5 bg-secondary rounded overflow-hidden">
                  <div className="h-full bg-status-info" style={{ width: `${e.efficiency}%` }} />
                </div>
                <span className="w-8 text-right">{e.efficiency}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="panel rounded-md p-4">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono mb-2">AI Reasoning Summary</div>
        <p className="text-sm leading-relaxed text-foreground/90">
          RICK continuously re-optimised assignments under {breached === 0 ? "zero" : breached} SLA breaches, saving
          {" "}<span className="text-status-info font-bold">{metrics.travelSavedMin} minutes</span> of travel and protecting
          {" "}<span className="text-status-ok font-bold">£{metrics.revenueProtected.toLocaleString()}</span> of at-risk revenue.
          Against the manual baseline of {metrics.manualBaselineSla}% SLA compliance, the system achieved
          {" "}<span className="text-primary font-bold">{metrics.slaHealth}%</span> — a measurable uplift of
          {" "}<span className="text-status-ok font-bold">+{aiUplift} points</span>.
        </p>
      </div>
    </div>
  );
}

function KPI({ label, value, sub, delta, good, bad }: { label: string; value: string; sub?: string; delta?: string; good?: boolean; bad?: boolean }) {
  const c = good ? "text-status-ok" : bad ? "text-status-crit" : "text-foreground";
  return (
    <div className="panel rounded-md p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">{label}</div>
      <div className={`text-2xl font-mono font-bold mt-1 ${c}`}>{value}</div>
      <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground mt-1">
        {sub && <span>{sub}</span>}
        {delta && <span className="ml-auto text-status-ok">{delta}</span>}
      </div>
    </div>
  );
}

function Bar({ label, value, max, unit }: { label: string; value: number; max: number; unit: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div>
      <div className="flex justify-between text-[11px] font-mono mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span>{value}{unit}</span>
      </div>
      <div className="h-1.5 bg-secondary rounded overflow-hidden">
        <div className="h-full bg-gradient-to-r from-primary/60 to-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
