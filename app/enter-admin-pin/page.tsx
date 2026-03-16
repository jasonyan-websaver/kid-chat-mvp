import { AdminPinGate } from '@/components/admin-pin-gate';

export default async function EnterAdminPinPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextPath = params.next || '/admin/memory';

  return <AdminPinGate nextPath={nextPath} />;
}
