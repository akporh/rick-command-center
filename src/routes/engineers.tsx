import { createFileRoute } from "@tanstack/react-router";
import { EngineerPanel } from "@/components/tower/EngineerPanel";
import { DetailDrawer } from "@/components/tower/DetailDrawer";

export const Route = createFileRoute("/engineers")({
  component: () => (
    <div className="h-[calc(100vh-3.5rem)] p-2 relative">
      <EngineerPanel />
      <DetailDrawer />
    </div>
  ),
});
