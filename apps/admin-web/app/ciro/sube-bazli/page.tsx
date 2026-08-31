import { Suspense } from "react";
import { BranchRevenueScreen } from "../../../components/revenue/branch-revenue-screen";
import { AdminStateCard } from "../../../components/ui/admin-ui";

export default function BranchRevenuePage() {
  return (
    <Suspense fallback={<AdminStateCard tone="info" message="Sube ciro verisi yukleniyor..." />}>
      <BranchRevenueScreen />
    </Suspense>
  );
}
