import { useSim } from "@/lib/simulation/store";
import { severityColor } from "@/lib/simulation/format";

export function EventTicker() {
  const events = useSim((s) => s.events);
  const recent = events.slice(0, 30);
  // duplicate for seamless scroll
  const items = [...recent, ...recent];

  return (
    <div className="h-7 border-t border-panel-border bg-panel/80 overflow-hidden relative flex items-center">
      <div className="shrink-0 px-3 text-[10px] uppercase tracking-widest font-mono text-primary border-r border-panel-border h-full grid place-items-center bg-background/40">
        EVENT STREAM
      </div>
      <div className="overflow-hidden flex-1">
        <div className="flex gap-6 whitespace-nowrap animate-ticker">
          {items.map((e, i) => (
            <div key={`${e.id}-${i}`} className="flex items-center gap-2 text-[11px] font-mono">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: severityColor(e.severity) }} />
              <span className="text-muted-foreground">T{String(e.tick).padStart(3, "0")}</span>
              <span className="text-foreground/90">{e.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
