import { NextRequest, NextResponse } from 'next/server';
import { getErrorCode, getErrorMessage, getErrorStatus } from '@/lib/app-error';
import { enforceImageUploadThrottle } from '@/lib/image-upload-throttle';
import { createRequestId, getErrorSummary, logError, logInfo, maskIdentifier, summarizeText } from '@/lib/observability';
import { sendMessageToKidChat } from '@/lib/openclaw';
import { getChildAuthErrorResponse, requireChildRequest, requireKnownChatId } from '@/lib/route-guards';
import { saveUploadedChatImage } from '@/lib/upload';

export async function POST(request: NextRequest) {
  const requestId = createRequestId();

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
      const normalizedMode = mode === 'image_generation' || mode === 'image_understanding' || mode === 'image_edit' ? mode : undefined;
      const hasImage = image instanceof File && image.size > 0;

      logInfo('api.chat.enter', {
        requestId,
        transport: 'multipart',
        mode: normalizedMode || 'chat',
        kidId: maskIdentifier(kidId),
        chatId: maskIdentifier(chatId),
        hasImage,
        imageCount: hasImage ? 1 : 0,
        imageMimeTypes: hasImage ? [image.type || 'application/octet-stream'] : [],
        imageTotalBytes: hasImage ? image.size : 0,
        messagePreview: summarizeText(message, 100),
      });

      if (!kidId || !chatId || (!message && !hasImage)) {
        return NextResponse.json({ error: 'Invalid request payload', requestId }, { status: 400 });
      }

      const uploadedImage = hasImage
        ? (await enforceImageUploadThrottle(kidId), await saveUploadedChatImage({ kidId, chatId, file: image }))
        : null;

      const reply = await sendMessageToKidChat({
        kidId,
        chatId,
        message,
        mode: normalizedMode,
        image: uploadedImage
          ? {
              url: uploadedImage.publicUrl,
              filePath: uploadedImage.filePath,
              contentType: uploadedImage.contentType,
            }
          : undefined,
        requestId,
      });

      return NextResponse.json({ reply, uploadedImage: uploadedImage ? { url: uploadedImage.publicUrl, contentType: uploadedImage.contentType } : null, requestId });
    }

    const body = (await request.json()) as {
      kidId?: string;
      chatId?: string;
      message?: string;
      mode?: 'chat' | 'image_generation' | 'image_understanding' | 'image_edit';
    };

    logInfo('api.chat.enter', {
      requestId,
      transport: 'json',
      mode: body.mode || 'chat',
      kidId: maskIdentifier(body.kidId),
      chatId: maskIdentifier(body.chatId),
      hasImage: false,
      imageCount: 0,
      imageMimeTypes: [],
      imageTotalBytes: 0,
      messagePreview: summarizeText(body.message, 100),
    });

    if (!body.kidId || !body.chatId || !body.message?.trim()) {
      return NextResponse.json({ error: 'Invalid request payload', requestId }, { status: 400 });
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
      requestId,
    });

    return NextResponse.json({ reply, requestId });
  } catch (error) {
    const status = getErrorStatus(error, 500);
    const code = getErrorCode(error);
    logError('api.chat.error', {
      requestId,
      mappedHttpStatus: status,
      publicErrorCode: code,
      error: getErrorSummary(error),
    });

    const errorMessage = status >= 500 ? '暂时无法处理请求，请稍后重试。' : getErrorMessage(error);

    return NextResponse.json(
      {
        error: errorMessage,
        requestId,
        ...(code ? { code } : {}),
      },
      { status },
    );
  }
}
