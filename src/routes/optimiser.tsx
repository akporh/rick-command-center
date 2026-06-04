import { createFileRoute } from "@tanstack/react-router";
import { useSim } from "@/lib/simulation/store";
import { OptimiserPanel } from "@/components/tower/OptimiserPanel";
import { riskBand } from "@/lib/simulation/format";

export const Route = createFileRoute("/optimiser")({
  component: Optimiser,
});

function Optimiser() {
  const { jobs, engineers, tick } = useSim();
  const open = jobs.filter((j) => j.status !== "completed" && j.status !== "breached").sort((a, b) => b.riskScore - a.riskScore);

  return (
    <div className="h-[calc(100vh-3.5rem)] grid grid-cols-12 gap-2 p-2 min-h-0">
      <section className="col-span-4 panel rounded-md flex flex-col min-h-0">
        <div className="panel-header px-3 py-2 text-[11px] font-mono uppercase tracking-widest">Job Queue · Priority Score</div>
        <div className="flex-1 overflow-auto p-2 space-y-1">
          {open.map((j) => {
            const band = riskBand(j.riskScore);
            return (
              <div key={j.id} className="p-2 rounded border border-panel-border bg-background/40" style={{ borderLeftWidth: 3, borderLeftColor: band.color }}>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold">{j.id}</span>
                  <span className="text-[9px] uppercase tracking-widest text-muted-foreground">{j.priority}</span>
                  <span className="ml-auto text-[9px] font-mono" style={{ color: band.color }}>risk {j.riskScore}</span>
                </div>
                <div className="text-[11px] font-mono truncate">{j.title}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="col-span-5 panel rounded-md flex flex-col min-h-0">
        <div className="panel-header px-3 py-2 text-[11px] font-mono uppercase tracking-widest">Suggested Schedule · Engineer Gantt</div>
        <div className="flex-1 overflow-auto p-3 space-y-2">
          {engineers.map((e) => {
            const ejobs = [e.currentJob, ...e.nextJobs].filter(Boolean).map((id) => jobs.find((j) => j.id === id)!).filter(Boolean);
            return (
              <div key={e.id}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs">{e.id}</span>
                  <span className="text-[10px] text-muted-foreground">{e.name}</span>
                </div>
                <div className="h-6 flex gap-0.5 bg-background/40 rounded overflow-hidden border border-panel-border">
                  {ejobs.length === 0 && <div className="flex-1 grid place-items-center text-[9px] font-mono uppercase tracking-widest text-muted-foreground">idle</div>}
                  {ejobs.map((j, i) => {
                    const band = riskBand(j.riskScore);
                    return (
                      <div key={j.id} className="flex-1 grid place-items-center text-[9px] font-mono px-1 truncate"
                        style={{ background: band.bg, color: band.color, opacity: i === 0 ? 1 : 0.7 }}>
                        {j.id}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="col-span-3 min-h-0"><OptimiserPanel /></section>
    </div>
  );
}
