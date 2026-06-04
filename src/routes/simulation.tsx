import { createFileRoute } from "@tanstack/react-router";
import { useSim } from "@/lib/simulation/store";
import { severityColor, fmtTime } from "@/lib/simulation/format";
import { RotateCcw, Zap, Activity, Skull } from "lucide-react";

export const Route = createFileRoute("/simulation")({
  component: Simulation,
});

const SCRIPT = [
  { t: "08:00", title: "Start of Day", body: "Optimal plan generated. All 14 jobs scheduled across 8 engineers." },
  { t: "09:30", title: "First disruption", body: "Engineer caught in traffic on ring road. SLA risk climbs; AI proposes re-route." },
  { t: "11:00", title: "Emergency injected", body: "Aurora Hospital chiller down. Full schedule re-optimisation in <2s." },
  { t: "13:00", title: "Overload", body: "Two engineers fall behind, job clustering recomputed." },
  { t: "15:30", title: "Cascade risk", body: "3 SLA breaches predicted. Autopilot triggers full rebalance." },
  { t: "17:00", title: "End-of-day", body: "SLA performance report, AI vs manual baseline comparison." },
];

function Simulation() {
  const { simMode, setSimMode, reset, simTimeMinutes, events, simTimeMinutes: t } = useSim();
  const modes = [
    { id: "scripted" as const, label: "Scripted Demo", icon: Activity, desc: "Deterministic — same wow moment every run" },
    { id: "live" as const, label: "Live Simulation", icon: Zap, desc: "Randomised — different outcome each run" },
    { id: "stress" as const, label: "Stress Test", icon: Skull, desc: "High disruption — SLA chaos, AI resilience" },
  ];

  return (
    <div className="h-[calc(100vh-3.5rem)] grid grid-cols-12 gap-2 p-2 min-h-0">
      <div className="col-span-5 panel rounded-md p-4 space-y-4 overflow-auto">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono">Mode</div>
          <h2 className="text-lg font-mono">Simulation Engine</h2>
        </div>
        <div className="space-y-2">
          {modes.map((m) => {
            const Icon = m.icon;
            const active = simMode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setSimMode(m.id)}
                className={`w-full text-left p-3 rounded border transition-all ${active ? "border-primary bg-primary/5" : "border-panel-border hover:bg-background/40"}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon size={14} className={active ? "text-primary" : ""} />
                  <span className="font-mono text-sm">{m.label}</span>
                  {active && <span className="ml-auto text-[9px] font-mono uppercase tracking-widest text-primary">ACTIVE</span>}
                </div>
                <div className="text-[11px] text-muted-foreground">{m.desc}</div>
              </button>
            );
          })}
        </div>
        <button
          onClick={() => reset()}
          className="flex items-center gap-2 px-3 py-2 rounded border border-panel-border text-xs font-mono uppercase tracking-widest hover:bg-secondary"
        >
          <RotateCcw size={12} /> Restart Simulation
        </button>

        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono mb-2">Day-in-the-life Script</div>
          <div className="space-y-2">
            {SCRIPT.map((s) => (
              <div key={s.t} className="p-2 rounded border border-panel-border bg-background/30">
                <div className="font-mono text-xs text-primary">{s.t} · {s.title}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{s.body}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="col-span-7 panel rounded-md flex flex-col min-h-0">
        <div className="panel-header px-3 py-2 flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-widest font-mono">Event Playback</span>
          <span className="ml-auto text-[10px] font-mono text-muted-foreground">sim time {fmtTime(t)}</span>
        </div>
        <div className="flex-1 overflow-auto p-2 space-y-1">
          {events.map((e) => (
            <div key={e.id} className="flex items-start gap-2 text-[11px] font-mono p-1.5 rounded hover:bg-background/40">
              <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: severityColor(e.severity) }} />
              <span className="text-muted-foreground w-12 shrink-0">T{String(e.tick).padStart(3, "0")}</span>
              <span className="text-foreground/90 flex-1">{e.message}</span>
              <span className="text-[9px] uppercase tracking-widest opacity-60 shrink-0">{e.kind}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
