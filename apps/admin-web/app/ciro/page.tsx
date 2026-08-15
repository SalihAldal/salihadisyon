import { Suspense } from "react";
import { RevenueOverviewScreen } from "../../components/revenue/revenue-overview-screen";

export default function RevenuePage() {
  return (
    <Suspense fallback={<div className="admin-surface admin-empty-state">Ciro verisi yukleniyor...</div>}>
      <RevenueOverviewScreen />
    </Suspense>
  );
}
