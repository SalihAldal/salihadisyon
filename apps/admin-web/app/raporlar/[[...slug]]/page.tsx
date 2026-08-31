import { Suspense } from "react";
import { ReportScreen } from "../../../components/reports/report-screen";
import { AdminStateCard } from "../../../components/ui/admin-ui";

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const resolved = await params;
  return (
    <Suspense fallback={<AdminStateCard tone="info" message="Rapor yukleniyor..." />}>
      <ReportScreen slug={resolved.slug?.[0]} />
    </Suspense>
  );
}
