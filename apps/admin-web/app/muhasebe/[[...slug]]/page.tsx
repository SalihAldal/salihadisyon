import { AccountingScreen } from "../../../components/accounting/accounting-screen";

export default async function AccountingPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const resolved = await params;
  return <AccountingScreen slug={resolved.slug?.[0]} />;
}
