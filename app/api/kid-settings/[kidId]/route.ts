import { NextRequest, NextResponse } from 'next/server';
import { getConfiguredKidById } from '@/lib/kid-settings';
import { requireKnownKidId } from '@/lib/route-guards';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ kidId: string }> },
) {
  try {
    const { kidId } = await params;
    const kid = await getConfiguredKidById(requireKnownKidId(kidId));

    if (!kid) {
      return NextResponse.json({ error: 'Unknown kid' }, { status: 404 });
    }

    return NextResponse.json({
      id: kid.id,
      name: kid.name,
      emoji: kid.emoji,
      accentColor: kid.accentColor,
      title: kid.title,
      welcome: kid.welcome,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
