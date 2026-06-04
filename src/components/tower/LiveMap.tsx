import { useSim } from "@/lib/simulation/store";
import { priorityColor, riskBand } from "@/lib/simulation/format";

const W = 1000, H = 560;

const ROADS = [
  "M 50 280 L 950 280",
  "M 500 30 L 500 530",
  "M 50 120 Q 300 150 500 120 T 950 140",
  "M 50 440 Q 300 410 500 440 T 950 420",
  "M 200 30 L 200 530",
  "M 800 30 L 800 530",
  "M 50 200 Q 250 240 500 200",
  "M 500 360 Q 700 320 950 360",
];

const DISTRICTS = [
  { x: 120, y: 80, w: 180, h: 130, label: "NORTH IND." },
  { x: 380, y: 50, w: 240, h: 140, label: "CENTRAL CBD" },
  { x: 700, y: 80, w: 220, h: 130, label: "TECH PARK" },
  { x: 100, y: 320, w: 240, h: 180, label: "RIVERSIDE" },
  { x: 400, y: 320, w: 220, h: 180, label: "DOWNTOWN" },
  { x: 680, y: 320, w: 240, h: 180, label: "PORT QTR" },
];

export function LiveMap({ height = 560 }: { height?: number }) {
  const { engineers, jobs, traffic, selectedEngineer, selectedJob, selectEngineer, selectJob } = useSim();

  return (
    <div className="relative w-full h-full overflow-hidden rounded-md border border-panel-border bg-[oklch(0.16_0.025_252)]">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full block" preserveAspectRatio="xMidYMid slice" style={{ minHeight: height }}>
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="oklch(0.28 0.025 252)" strokeWidth="0.5" />
          </pattern>
          <radialGradient id="trafficGrad">
            <stop offset="0%" stopColor="oklch(0.66 0.25 25)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="oklch(0.66 0.25 25)" stopOpacity="0" />
          </radialGradient>
          <filter id="glow"><feGaussianBlur stdDeviation="2" /></filter>
        </defs>
        <rect width={W} height={H} fill="url(#grid)" />

        {/* districts */}
        {DISTRICTS.map((d, i) => (
          <g key={i}>
            <rect x={d.x} y={d.y} width={d.w} height={d.h} fill="oklch(0.22 0.03 252)" stroke="oklch(0.30 0.03 252)" strokeWidth="0.5" rx="4" />
            <text x={d.x + 6} y={d.y + 14} fill="oklch(0.5 0.02 250)" fontSize="9" fontFamily="JetBrains Mono" letterSpacing="2">{d.label}</text>
          </g>
        ))}

        {/* roads */}
        {ROADS.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="oklch(0.34 0.03 250)" strokeWidth="3" strokeLinecap="round" />
        ))}
        {ROADS.map((d, i) => (
          <path key={`c${i}`} d={d} fill="none" stroke="oklch(0.5 0.04 250 / 0.4)" strokeWidth="0.4" strokeDasharray="4 6" />
        ))}

        {/* traffic zones */}
        {traffic.map((z) => (
          <g key={z.id}>
            <circle cx={z.cx} cy={z.cy} r={z.r} fill="url(#trafficGrad)" />
            <circle cx={z.cx} cy={z.cy} r={z.r} fill="none" stroke="oklch(0.66 0.25 25 / 0.6)" strokeWidth="1" strokeDasharray="3 4" />
            <text x={z.cx} y={z.cy + 4} textAnchor="middle" fontSize="10" fontFamily="JetBrains Mono" fill="oklch(0.85 0.15 25)">
              ×{z.multiplier.toFixed(1)}
            </text>
          </g>
        ))}

        {/* engineer routes */}
        {engineers.filter((e) => e.destination).map((e) => (
          <line
            key={`r-${e.id}`}
            x1={e.location.x}
            y1={e.location.y}
            x2={e.destination!.x}
            y2={e.destination!.y}
            stroke="oklch(0.78 0.16 195 / 0.5)"
            strokeWidth="1.2"
            strokeDasharray="4 4"
          />
        ))}

        {/* jobs */}
        {jobs.filter((j) => j.status !== "completed").map((j) => {
          const band = riskBand(j.riskScore);
          const isSelected = selectedJob === j.id;
          return (
            <g key={j.id} onClick={() => selectJob(j.id)} className="cursor-pointer">
              {j.riskScore > 70 && (
                <circle cx={j.location.x} cy={j.location.y} r="14" fill="none" stroke={band.color} strokeWidth="1.5" className="ping-ring" style={{ transformOrigin: `${j.location.x}px ${j.location.y}px` }} />
              )}
              <rect
                x={j.location.x - 6}
                y={j.location.y - 6}
                width="12"
                height="12"
                fill={priorityColor(j.priority)}
                stroke={isSelected ? "white" : "oklch(0.18 0.02 250)"}
                strokeWidth={isSelected ? "2" : "1"}
                transform={`rotate(45 ${j.location.x} ${j.location.y})`}
              />
              <text x={j.location.x + 10} y={j.location.y + 3} fontSize="9" fontFamily="JetBrains Mono" fill="oklch(0.85 0.01 240)">
                {j.id}
              </text>
            </g>
          );
        })}

        {/* engineers */}
        {engineers.map((e) => {
          const color = e.status === "delayed" ? "var(--color-status-crit)" : e.status === "idle" ? "var(--color-status-idle)" : e.status === "working" ? "var(--color-status-ok)" : "var(--color-status-info)";
          const isSelected = selectedEngineer === e.id;
          return (
            <g key={e.id} onClick={() => selectEngineer(e.id)} className="cursor-pointer">
              <circle cx={e.location.x} cy={e.location.y} r="10" fill={color} opacity="0.25" filter="url(#glow)" />
              <circle cx={e.location.x} cy={e.location.y} r="7" fill={color} stroke={isSelected ? "white" : "oklch(0.16 0.025 252)"} strokeWidth={isSelected ? "2" : "1.5"} />
              <text x={e.location.x} y={e.location.y + 3} textAnchor="middle" fontSize="8" fontFamily="JetBrains Mono" fontWeight="bold" fill="oklch(0.15 0.02 250)">
                {e.id.replace("E", "")}
              </text>
            </g>
          );
        })}
      </svg>

      {/* legend */}
      <div className="absolute bottom-3 left-3 panel rounded p-2 text-[10px] font-mono uppercase tracking-widest space-y-1">
        <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-status-ok" /> Working</div>
        <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-status-info" /> En route</div>
        <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-status-crit" /> Delayed</div>
        <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-status-idle" /> Idle</div>
      </div>
      <div className="absolute top-3 left-3 panel rounded px-2 py-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        Live Map · {engineers.length} engineers · {jobs.filter(j => j.status !== "completed").length} active jobs
      </div>
      <div className="absolute inset-0 pointer-events-none scanline" />
    </div>
  );
}
