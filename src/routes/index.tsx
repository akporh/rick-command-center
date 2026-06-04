import { createFileRoute } from "@tanstack/react-router";
import { LiveMap } from "@/components/tower/LiveMap";
import { OptimiserPanel } from "@/components/tower/OptimiserPanel";
import { EngineerPanel } from "@/components/tower/EngineerPanel";
import { JobRiskPanel } from "@/components/tower/JobRiskPanel";
import { GlobalActions } from "@/components/tower/GlobalActions";
import { EventTicker } from "@/components/tower/EventTicker";
import { DetailDrawer } from "@/components/tower/DetailDrawer";

export const Route = createFileRoute("/")({
  component: ControlTower,
});

function ControlTower() {
  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      <div className="flex-1 grid grid-cols-12 grid-rows-2 gap-2 p-2 min-h-0">
        <section className="col-span-8 row-span-1 relative min-h-0">
          <LiveMap />
          <GlobalActions />
          <DetailDrawer />
        </section>
        <section className="col-span-4 row-span-1 min-h-0">
          <OptimiserPanel />
        </section>
        <section className="col-span-8 row-span-1 min-h-0">
          <EngineerPanel />
        </section>
        <section className="col-span-4 row-span-1 min-h-0">
          <JobRiskPanel />
        </section>
      </div>
      <EventTicker />
    </div>
  );
}
