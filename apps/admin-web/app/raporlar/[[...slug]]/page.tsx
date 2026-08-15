import { Suspense } from "react";
import { ReportScreen } from "../../../components/reports/report-screen";

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const resolved = await params;
  return (
    <Suspense fallback={<div className="admin-surface admin-empty-state">Rapor yukleniyor...</div>}>
      <ReportScreen slug={resolved.slug?.[0]} />
    </Suspense>
  );
}
