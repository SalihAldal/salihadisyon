import { PosSettingsScreen } from "../../../components/pos-settings/pos-settings-screen";
import { PrintIntegrationsScreen } from "../../../components/print-integrations/print-integrations-screen";
import { BackupScreen } from "../../../components/backup/backup-screen";
import { FeatureFlagsScreen } from "../../../components/feature-flags/feature-flags-screen";

export default async function PosSettingsPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const resolved = await params;
  if (resolved.slug?.[0] === "yedekleme") {
    return <BackupScreen />;
  }
  if (resolved.slug?.[0] === "feature-flags") {
    return <FeatureFlagsScreen />;
  }
  if (resolved.slug?.[0] === "fis-entegrasyonlari") {
    return <PrintIntegrationsScreen />;
  }
  return <PosSettingsScreen slug={resolved.slug?.[0]} />;
}
