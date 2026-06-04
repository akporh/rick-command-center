import { useSim } from "@/lib/simulation/store";
import { RefreshCw, ShieldAlert, Siren, Bot, Snowflake } from "lucide-react";

export function GlobalActions() {
  const { recomputeAll, resolveSlaRisks, injectEmergency, freeze, frozen, systemMode, setSystemMode } = useSim();

  const Btn = ({ onClick, icon: Icon, label, danger, active }: { onClick: () => void; icon: typeof RefreshCw; label: string; danger?: boolean; active?: boolean }) => (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-[10px] font-mono uppercase tracking-widest transition-all ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : danger
          ? "border-status-crit/40 text-status-crit hover:bg-status-crit/10"
          : "border-panel-border text-foreground/80 hover:bg-secondary"
      }`}
    >
      <Icon size={12} />
      {label}
    </button>
  );

  return (
    <div className="absolute top-3 right-3 panel rounded p-1.5 flex flex-col gap-1 z-20">
      <Btn onClick={recomputeAll} icon={RefreshCw} label="Recompute" />
      <Btn onClick={resolveSlaRisks} icon={ShieldAlert} label="Resolve SLA" />
      <Btn onClick={injectEmergency} icon={Siren} label="Inject Emergency" danger />
      <Btn
        onClick={() => setSystemMode(systemMode === "autopilot" ? "copilot" : "autopilot")}
        icon={Bot}
        label={systemMode === "autopilot" ? "Autopilot ON" : "Engage Autopilot"}
        active={systemMode === "autopilot"}
      />
      <Btn onClick={freeze} icon={Snowflake} label={frozen ? "Frozen" : "Freeze"} active={frozen} />
    </div>
  );
}
