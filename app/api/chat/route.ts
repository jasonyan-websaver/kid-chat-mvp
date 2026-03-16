import { NextRequest, NextResponse } from 'next/server';
import { getErrorMessage, getErrorStatus } from '@/lib/app-error';
import { sendMessageToKidChat } from '@/lib/openclaw';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      kidId?: string;
      chatId?: string;
      message?: string;
    };

    if (!body.kidId || !body.chatId || !body.message?.trim()) {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
    }

    const reply = await sendMessageToKidChat({
      kidId: body.kidId,
      chatId: body.chatId,
      message: body.message,
    });

    return NextResponse.json({ reply });
  } catch (error) {
    return NextResponse.json(
      {
        error: getErrorMessage(error),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
