import { PinGate } from '@/components/pin-gate';
import { getConfiguredKidById } from '@/lib/kid-settings';

export const dynamic = 'force-dynamic';

export default async function EnterPinPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; kid?: string }>;
}) {
  const params = await searchParams;
  const nextPath = params.next || '/';
  const kidId = params.kid || '';
  const kid = kidId ? await getConfiguredKidById(kidId) : null;

  return <PinGate nextPath={nextPath} kidId={kidId} initialKid={kid} />;
}
