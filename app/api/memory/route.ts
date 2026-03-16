import { NextRequest, NextResponse } from 'next/server';
import { readKidAgentMemory, writeKidAgentMemory } from '@/lib/memory-admin';

export async function GET(request: NextRequest) {
  try {
    const kidId = request.nextUrl.searchParams.get('kidId');
    if (!kidId) {
      return NextResponse.json({ error: 'kidId is required' }, { status: 400 });
    }

    const content = await readKidAgentMemory(kidId);
    return NextResponse.json({ content });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { kidId?: string; content?: string };
    if (!body.kidId || typeof body.content !== 'string') {
      return NextResponse.json({ error: 'kidId and content are required' }, { status: 400 });
    }

    await writeKidAgentMemory(body.kidId, body.content);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
