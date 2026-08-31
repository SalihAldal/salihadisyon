import { Suspense } from "react";
import { RevenueOverviewScreen } from "../../components/revenue/revenue-overview-screen";
import { AdminStateCard } from "../../components/ui/admin-ui";

export default function RevenuePage() {
  return (
    <Suspense fallback={<AdminStateCard tone="info" message="Ciro verisi yukleniyor..." />}>
      <RevenueOverviewScreen />
    </Suspense>
  );
}
