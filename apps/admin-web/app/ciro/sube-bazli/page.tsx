import { Suspense } from "react";
import { BranchRevenueScreen } from "../../../components/revenue/branch-revenue-screen";

export default function BranchRevenuePage() {
  return (
    <Suspense fallback={<div className="admin-surface admin-empty-state">Sube ciro verisi yukleniyor...</div>}>
      <BranchRevenueScreen />
    </Suspense>
  );
}
