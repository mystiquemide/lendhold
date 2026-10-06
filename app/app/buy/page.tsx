import { AppGate } from "@/components/app/AppGate";
import { StockPicker } from "@/components/app/StockPicker";

export default function BuyListPage() {
  return (
    <AppGate>
      <StockPicker />
    </AppGate>
  );
}
