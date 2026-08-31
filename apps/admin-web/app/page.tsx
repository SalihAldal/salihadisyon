import { Suspense } from "react";
import { DashboardScreen } from "../components/dashboard/dashboard-screen";
import { AdminStateCard } from "../components/ui/admin-ui";

export default function DashboardPage() {
  return (
    <Suspense fallback={<AdminStateCard tone="info" message="Dashboard yukleniyor..." />}>
      <DashboardScreen />
    </Suspense>
  );
}
