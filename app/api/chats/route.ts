import { NextRequest, NextResponse } from 'next/server';
import { createChatForKid } from '@/lib/openclaw';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { kidId?: string };

    if (!body.kidId) {
      return NextResponse.json({ error: 'kidId is required' }, { status: 400 });
    }

    const result = await createChatForKid(body.kidId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
