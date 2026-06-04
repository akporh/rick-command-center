import { createFileRoute } from "@tanstack/react-router";
import { JobRiskPanel } from "@/components/tower/JobRiskPanel";
import { DetailDrawer } from "@/components/tower/DetailDrawer";
import { useSim } from "@/lib/simulation/store";
import { riskBand, statusLabel } from "@/lib/simulation/format";

export const Route = createFileRoute("/jobs")({
  component: Jobs,
});

function Jobs() {
  const { jobs } = useSim();
  return (
    <div className="h-[calc(100vh-3.5rem)] grid grid-cols-12 gap-2 p-2 min-h-0 relative">
      <div className="col-span-5 min-h-0"><JobRiskPanel /></div>
      <div className="col-span-7 panel rounded-md flex flex-col min-h-0">
        <div className="panel-header px-3 py-2 text-[11px] font-mono uppercase tracking-widest">All Jobs · {jobs.length}</div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-[11px] font-mono">
            <thead className="text-[9px] uppercase tracking-widest text-muted-foreground sticky top-0 bg-panel">
              <tr>
                <th className="text-left p-2">ID</th>
                <th className="text-left p-2">Customer</th>
                <th className="text-left p-2">Skill</th>
                <th className="text-left p-2">Status</th>
                <th className="text-right p-2">Risk</th>
                <th className="text-right p-2">Progress</th>
                <th className="text-right p-2">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => {
                const band = riskBand(j.riskScore);
                return (
                  <tr key={j.id} className="border-t border-panel-border hover:bg-background/40">
                    <td className="p-2 font-bold">{j.id}</td>
                    <td className="p-2 truncate max-w-[180px]">{j.customer}</td>
                    <td className="p-2 text-muted-foreground">{j.skill}</td>
                    <td className="p-2">{statusLabel(j.status)}</td>
                    <td className="p-2 text-right" style={{ color: band.color }}>{j.riskScore}</td>
                    <td className="p-2 text-right">{Math.round(j.progress)}%</td>
                    <td className="p-2 text-right">£{j.revenue}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <DetailDrawer />
    </div>
  );
}
