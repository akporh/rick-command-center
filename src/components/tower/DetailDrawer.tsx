import { useSim } from "@/lib/simulation/store";
import { statusLabel, riskBand } from "@/lib/simulation/format";
import { X } from "lucide-react";

export function DetailDrawer() {
  const { selectedEngineer, selectedJob, engineers, jobs, selectEngineer, selectJob } = useSim();
  const e = engineers.find((x) => x.id === selectedEngineer);
  const j = jobs.find((x) => x.id === selectedJob);
  if (!e && !j) return null;

  return (
    <div className="absolute right-3 bottom-12 w-80 panel rounded-md z-30 shadow-2xl">
      <div className="panel-header px-3 py-2 flex items-center">
        <span className="text-[11px] uppercase tracking-widest font-mono text-primary">
          {e ? "Engineer Profile" : "Job Detail"}
        </span>
        <button onClick={() => { selectEngineer(null); selectJob(null); }} className="ml-auto text-muted-foreground hover:text-foreground">
          <X size={14} />
        </button>
      </div>
      <div className="p-3 space-y-2">
        {e && (
          <>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded bg-secondary grid place-items-center font-mono font-bold">{e.initials}</div>
              <div>
                <div className="font-mono text-sm">{e.name}</div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{e.id} · {statusLabel(e.status)}</div>
              </div>
            </div>
            <div className="text-[10px] font-mono space-y-1 text-muted-foreground">
              <Row k="Skills" v={e.skills.join(", ")} />
              <Row k="Speed factor" v={e.speedFactor.toFixed(2) + "×"} />
              <Row k="Reliability" v={Math.round(e.reliability * 100) + "%"} />
              <Row k="Efficiency" v={e.efficiency + "%"} />
              <Row k="Fatigue" v={e.fatigue + "%"} />
              <Row k="Current" v={e.currentJob ?? "—"} />
              <Row k="Queue" v={String(e.nextJobs.length)} />
            </div>
            <div className="text-[10px] font-mono p-2 rounded bg-primary/5 border border-primary/20 text-primary/90 leading-snug">
              AI: {e.efficiency < 80 ? `Engineer is ${100 - e.efficiency}% below baseline today. Suggest lighter ${e.skills[0]} workload.` : `Performing above baseline. Reliable candidate for SLA rescues.`}
            </div>
          </>
        )}
        {j && (() => {
          const band = riskBand(j.riskScore);
          return (
            <>
              <div>
                <div className="font-mono text-sm">{j.id} · {j.title}</div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{j.customer}</div>
              </div>
              <div className="flex gap-2">
                <span className="text-[9px] font-mono px-2 py-0.5 rounded uppercase tracking-widest" style={{ background: band.bg, color: band.color }}>{band.label}</span>
                <span className="text-[9px] font-mono px-2 py-0.5 rounded uppercase tracking-widest bg-secondary">{j.priority}</span>
                <span className="text-[9px] font-mono px-2 py-0.5 rounded uppercase tracking-widest bg-secondary">{j.skill}</span>
              </div>
              <div className="text-[10px] font-mono space-y-1 text-muted-foreground">
                <Row k="Progress" v={Math.round(j.progress) + "%"} />
                <Row k="Status" v={statusLabel(j.status)} />
                <Row k="Assigned" v={j.assignedEngineer ?? "Unassigned"} />
                <Row k="Revenue" v={`£${j.revenue}`} />
                <Row k="Penalty" v={`£${j.penalty}`} />
                <Row k="FTF prob" v={`${j.firstTimeFix}%`} />
                <Row k="Duration" v={`${j.durationBase} min`} />
              </div>
              <div className="text-[10px] font-mono p-2 rounded bg-primary/5 border border-primary/20 text-primary/90 leading-snug">
                AI: {j.riskScore > 70 ? `High breach risk. Best rescue: reassign to nearest ${j.skill}-skilled idle engineer.` : `On track. Continue with current assignment; FTF confidence ${j.firstTimeFix}%.`}
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><span>{k}</span><span className="text-foreground/90">{v}</span></div>;
}
