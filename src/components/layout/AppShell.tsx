import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useSim } from "@/lib/simulation/store";
import { fmtTime } from "@/lib/simulation/format";
import { Activity, Map, Users, Briefcase, Sparkles, Play, Pause, Gauge, Radio, FlaskConical } from "lucide-react";

const navItems = [
  { to: "/", label: "Control Tower", icon: Activity },
  { to: "/optimiser", label: "Optimiser", icon: Sparkles },
  { to: "/map", label: "Live Map", icon: Map },
  { to: "/engineers", label: "Engineers", icon: Users },
  { to: "/jobs", label: "Jobs", icon: Briefcase },
  { to: "/simulation", label: "Simulation", icon: FlaskConical },
  { to: "/insights", label: "Insights", icon: Gauge },
];

export function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { running, toggle, speed, setSpeed, systemMode, setSystemMode, simTimeMinutes, metrics, engineers, jobs, tick, dayEnded, dayPhase, dayNumber } = useSim();
  const active = engineers.filter((e) => e.status !== "idle" && e.status !== "off_shift").length;
  const openJobs = jobs.filter((j) => j.status !== "completed" && j.status !== "breached").length;

  const phaseMeta: Record<typeof dayPhase, { label: string; cls: string }> = {
    preshift: { label: "Pre-shift", cls: "bg-status-info/15 text-status-info" },
    active: { label: "Active", cls: "bg-status-ok/15 text-status-ok" },
    winddown: { label: "Wind-down", cls: "bg-status-warn/15 text-status-warn" },
    eod: { label: dayEnded ? "Closed" : "EOD", cls: "bg-status-crit/15 text-status-crit" },
  };
  const phase = phaseMeta[dayPhase];

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Top bar */}
      <header className="h-14 border-b border-panel-border bg-panel/80 backdrop-blur flex items-center px-4 gap-6 sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-gradient-to-br from-primary to-primary/40 grid place-items-center font-mono font-bold text-primary-foreground glow-cyan">R</div>
          <div className="leading-tight">
            <div className="font-mono text-sm font-bold tracking-widest">RICK</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Control Tower</div>
          </div>
        </div>

        <div className="flex items-center gap-1 px-3 py-1 rounded border border-panel-border bg-background/40">
          <Radio size={12} className={dayEnded ? "text-muted-foreground" : "text-status-ok pulse-dot"} />
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Day {dayNumber}</span>
          <span className="font-mono text-xs ml-2 text-status-info">{fmtTime(simTimeMinutes)}</span>
          <span className="font-mono text-[10px] ml-2 text-muted-foreground">T{String(tick).padStart(3, "0")}</span>
          <span className={`ml-2 text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded ${phase.cls}`}>{phase.label}</span>
        </div>

        <Metric label="SLA Health" value={`${metrics.slaHealth}%`} accent={metrics.slaHealth > 80 ? "ok" : metrics.slaHealth > 60 ? "warn" : "crit"} />
        <Metric label="Active Jobs" value={String(openJobs)} />
        <Metric label="Engineers" value={`${active}/${engineers.length}`} />
        <Metric label="Breaches" value={String(metrics.breached)} accent={metrics.breached > 0 ? "crit" : "ok"} />

        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded border border-panel-border overflow-hidden">
            {(["manual", "copilot", "autopilot"] as const).map((m) => {
              const tip =
                m === "manual"
                  ? "Manual: you assign every job. AI suggests but never acts."
                  : m === "copilot"
                  ? "Copilot: AI auto-assigns new jobs. Reassignments need your approval."
                  : "Autopilot: AI auto-assigns and auto-accepts safe reassignments (with cooldowns).";
              return (
                <button
                  key={m}
                  onClick={() => setSystemMode(m)}
                  title={tip}
                  className={`px-3 py-1 text-[11px] uppercase tracking-widest font-mono ${
                    systemMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m}
                </button>
              );
            })}
          </div>
          <div className="flex rounded border border-panel-border overflow-hidden">
            {([1, 2, 4, 8] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`px-2 py-1 text-[11px] font-mono ${speed === s ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {s}x
              </button>
            ))}
          </div>
          <button
            onClick={toggle}
            className="flex items-center gap-1 px-3 py-1 rounded border border-panel-border text-xs hover:bg-secondary"
          >
            {running ? <Pause size={12} /> : <Play size={12} />}
            <span className="font-mono uppercase tracking-widest text-[10px]">{running ? "Pause" : "Run"}</span>
          </button>
        </div>
      </header>

      <div className="flex-1 flex">
        {/* Sidebar */}
        <aside className="w-52 shrink-0 border-r border-panel-border bg-panel/60 py-3">
          <nav className="flex flex-col gap-0.5 px-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary border-l-2 border-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  }`}
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="px-3 mt-6">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Session</div>
            <div className="text-[11px] font-mono text-muted-foreground space-y-1">
              <div className="flex justify-between"><span>Revenue saved</span><span className="text-status-ok">£{metrics.revenueProtected.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>Travel saved</span><span className="text-status-info">{metrics.travelSavedMin}m</span></div>
              <div className="flex justify-between"><span>AI actions</span><span>{metrics.aiAcceptedCount}</span></div>
            </div>
          </div>
        </aside>

        <main className="flex-1 min-w-0 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: "ok" | "warn" | "crit" }) {
  const color = accent === "ok" ? "text-status-ok" : accent === "warn" ? "text-status-warn" : accent === "crit" ? "text-status-crit" : "text-foreground";
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      <span className={`font-mono text-sm font-bold ${color}`}>{value}</span>
    </div>
  );
}
