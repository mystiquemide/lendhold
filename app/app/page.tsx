import { AppGate } from "@/components/app/AppGate";
import { ConnectedHome } from "@/components/app/ConnectedHome";

export default function AppHome() {
  return (
    <AppGate>
      <ConnectedHome />
    </AppGate>
  );
}
