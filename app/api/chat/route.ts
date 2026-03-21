import { NextRequest, NextResponse } from 'next/server';
import { getErrorMessage, getErrorStatus } from '@/lib/app-error';
import { enforceImageUploadThrottle } from '@/lib/image-upload-throttle';
import { sendMessageToKidChat } from '@/lib/openclaw';
import { getChildAuthErrorResponse, requireChildRequest, requireKnownChatId } from '@/lib/route-guards';
import { saveUploadedChatImage } from '@/lib/upload';

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const rawKidId = String(form.get('kidId') || '').trim();
      const authError = getChildAuthErrorResponse(request, rawKidId);
      if (authError) return authError;
      const kidId = requireChildRequest(request, rawKidId);
      const chatId = requireKnownChatId(String(form.get('chatId') || '').trim());
      const message = String(form.get('message') || '').trim();
      const image = form.get('image');
      const mode = String(form.get('mode') || '').trim();

      if (!kidId || !chatId || (!message && !(image instanceof File && image.size > 0))) {
        return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
      }

      const uploadedImage = image instanceof File && image.size > 0
        ? (await enforceImageUploadThrottle(kidId), await saveUploadedChatImage({ kidId, chatId, file: image }))
        : null;

      const reply = await sendMessageToKidChat({
        kidId,
        chatId,
        message,
        mode: mode === 'image_generation' || mode === 'image_understanding' || mode === 'image_edit' ? mode : undefined,
        image: uploadedImage
          ? {
              url: uploadedImage.publicUrl,
              filePath: uploadedImage.filePath,
              contentType: uploadedImage.contentType,
            }
          : undefined,
      });

      return NextResponse.json({ reply, uploadedImage: uploadedImage ? { url: uploadedImage.publicUrl, contentType: uploadedImage.contentType } : null });
    }

    const body = (await request.json()) as {
      kidId?: string;
      chatId?: string;
      message?: string;
      mode?: 'chat' | 'image_generation' | 'image_understanding' | 'image_edit';
    };

    if (!body.kidId || !body.chatId || !body.message?.trim()) {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
    }

    const authError = getChildAuthErrorResponse(request, body.kidId);
    if (authError) return authError;

    const kidId = requireChildRequest(request, body.kidId);
    const chatId = requireKnownChatId(body.chatId);

    const reply = await sendMessageToKidChat({
      kidId,
      chatId,
      message: body.message,
      mode: body.mode,
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
