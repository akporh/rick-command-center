import { useSim } from "@/lib/simulation/store";
import { Check, X, Sparkles, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function OptimiserPanel() {
  const { recommendations, acceptRecommendation, rejectRecommendation, recomputeAll, systemMode } = useSim();

  return (
    <div className="panel rounded-md flex flex-col h-full overflow-hidden">
      <div className="panel-header px-3 py-2 flex items-center gap-2">
        <Sparkles size={14} className="text-primary" />
        <span className="text-[11px] uppercase tracking-widest font-mono">AI Schedule Optimiser</span>
        <span className="ml-auto text-[10px] font-mono text-muted-foreground">{recommendations.length} action{recommendations.length === 1 ? "" : "s"}</span>
        <button onClick={recomputeAll} className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20">
          Recompute
        </button>
      </div>
      <div className="flex-1 overflow-auto p-2 space-y-2">
        {systemMode === "autopilot" ? (
          <div className="text-[10px] font-mono uppercase tracking-widest p-2 rounded border border-primary/30 bg-primary/5 text-primary">
            AUTOPILOT · Auto-executing safe actions (max 1/tick, with cooldowns)
          </div>
        ) : (
          <div className="text-[10px] font-mono uppercase tracking-widest p-2 rounded border border-panel-border bg-background/40 text-muted-foreground">
            {systemMode === "manual" ? "MANUAL · " : "COPILOT · "}Approval required for every action
          </div>
        )}
        <AnimatePresence initial={false}>
          {recommendations.map((r) => (
            <motion.div
              key={r.id}
              layout
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="rounded border border-panel-border bg-background/40 p-2.5"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                  {r.type}
                </span>
                <span className="font-mono text-xs">{r.jobId}</span>
                {r.fromEngineer && (
                  <span className="font-mono text-[10px] text-muted-foreground flex items-center gap-1">
                    {r.fromEngineer} <ArrowRight size={10} /> {r.toEngineer}
                  </span>
                )}
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">conf {r.confidence}%</span>
              </div>
              <p className="text-xs text-foreground/90 leading-snug mb-2">{r.reasoning}</p>
              <div className="grid grid-cols-3 gap-1 mb-2 text-[10px] font-mono">
                <div className="text-center p-1 rounded bg-status-ok/10 text-status-ok">
                  <div className="text-[8px] uppercase opacity-70">SLA</div>
                  <div className="font-bold">+{r.slaImprovement}%</div>
                </div>
                <div className="text-center p-1 rounded bg-status-info/10 text-status-info">
                  <div className="text-[8px] uppercase opacity-70">Travel</div>
                  <div className="font-bold">-{r.travelReductionMin}m</div>
                </div>
                <div className="text-center p-1 rounded bg-status-warn/10 text-status-warn">
                  <div className="text-[8px] uppercase opacity-70">Saved</div>
                  <div className="font-bold">£{r.revenueProtected}</div>
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => acceptRecommendation(r.id)}
                  className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-primary text-primary-foreground text-[10px] font-mono uppercase tracking-widest hover:opacity-90"
                >
                  <Check size={11} /> Accept
                </button>
                <button
                  onClick={() => rejectRecommendation(r.id)}
                  className="px-3 py-1 rounded border border-panel-border text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground"
                >
                  <X size={11} />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {recommendations.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-8 font-mono uppercase tracking-widest">
            System optimal — no actions required
          </div>
        )}
      </div>
    </div>
  );
}
