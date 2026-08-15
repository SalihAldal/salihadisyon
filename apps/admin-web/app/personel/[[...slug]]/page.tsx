import { StaffScreen } from "../../../components/staff/staff-screen";

export default async function StaffPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const resolved = await params;
  return <StaffScreen slug={resolved.slug?.[0]} />;
}
