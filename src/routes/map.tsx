import { createFileRoute } from "@tanstack/react-router";
import { LiveMap } from "@/components/tower/LiveMap";
import { EventTicker } from "@/components/tower/EventTicker";
import { GlobalActions } from "@/components/tower/GlobalActions";
import { DetailDrawer } from "@/components/tower/DetailDrawer";

export const Route = createFileRoute("/map")({
  component: () => (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      <div className="flex-1 relative p-2 min-h-0">
        <LiveMap />
        <GlobalActions />
        <DetailDrawer />
      </div>
      <EventTicker />
    </div>
  ),
});
