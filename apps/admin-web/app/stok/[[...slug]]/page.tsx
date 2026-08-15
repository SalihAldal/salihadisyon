import { InventoryScreen } from "../../../components/inventory/inventory-screen";

export default async function InventoryPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const resolved = await params;
  return <InventoryScreen slug={resolved.slug?.[0]} />;
}
