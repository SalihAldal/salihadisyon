import { Suspense } from "react";
import { DashboardScreen } from "../components/dashboard/dashboard-screen";

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="admin-surface admin-empty-state">Dashboard yukleniyor...</div>}>
      <DashboardScreen />
    </Suspense>
  );
}
