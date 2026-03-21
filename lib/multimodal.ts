import { ChatAttachment, ChatMessage, ImageAttachmentAnalysis, getMessageAttachments } from './types';

export type MultimodalIntent = 'chat' | 'image_understanding' | 'image_generation' | 'image_edit';

export type UploadedChatImage = {
  url: string;
  filePath: string;
  contentType?: string;
};

export type MultimodalPlan = {
  intent: MultimodalIntent;
  uploadedAttachments: ChatAttachment[];
  imageGenerationPrompt?: string;
};

function normalize(text: string) {
  return text.trim().replace(/\s+/g, ' ');
}

export function buildUploadedImageAttachment(image: UploadedChatImage, prompt?: string): ChatAttachment {
  return {
    kind: 'image_input',
    url: image.url,
    contentType: image.contentType,
    source: 'upload',
    prompt: prompt?.trim() || undefined,
  };
}

export function detectMultimodalIntent(params: {
  message: string;
  uploadedAttachments?: ChatAttachment[];
  history?: ChatMessage[];
}): MultimodalPlan {
  const text = normalize(params.message || '');
  const uploadedAttachments = params.uploadedAttachments || [];
  const lowered = text.toLowerCase();
  const history = params.history || [];
  const hasGeneratedImageInHistory = history.some((message) =>
    getMessageAttachments(message).some((attachment) => attachment.kind === 'image_generated'),
  );

  const asksToGenerate = /(生成|画|绘制|做一张|做个图|create an image|generate an image|draw|illustrate|make an image|dessine|dessiner|dessine-moi|dessine moi|crée une image|cree une image|génère une image|genere une image|fais-moi un dessin|fais moi un dessin|fais une image|image de)/i.test(text);
  const asksToEdit = /(改成|修改这张图|参考这张图|用这张图|edit this image|edit the image|based on this image|use this image|modifie cette image|modifie l'image|à partir de cette image|a partir de cette image|utilise cette image)/i.test(text);

  if (uploadedAttachments.length > 0 && asksToEdit) {
    return {
      intent: 'image_edit',
      uploadedAttachments,
      imageGenerationPrompt: text || undefined,
    };
  }

  if (asksToGenerate || (hasGeneratedImageInHistory && /(再来一张|换一个|换个风格|再生成|another one|another image|different style)/i.test(text))) {
    return {
      intent: 'image_generation',
      uploadedAttachments,
      imageGenerationPrompt: text || undefined,
    };
  }

  if (uploadedAttachments.length > 0) {
    return {
      intent: 'image_understanding',
      uploadedAttachments,
    };
  }

  return {
    intent: 'chat',
    uploadedAttachments,
  };
}

export function buildImageUnderstandingPrompt(params: {
  kidName: string;
  latestMessage: string;
  analysis: ImageAttachmentAnalysis;
}) {
  const lines = [
    `You are preparing grounded image context for ${params.kidName}'s child-friendly chat assistant.`,
    'The assistant will use this to explain an uploaded image clearly and safely.',
    '',
    `Child message: ${params.latestMessage || '(no extra text)'}`,
    '',
    'Structured image understanding:',
    `- Summary: ${params.analysis.summary || 'Unknown'}`,
    `- Visible text: ${(params.analysis.visibleText || []).join(' | ') || 'None'}`,
    `- Visible objects: ${(params.analysis.objects || []).join(' | ') || 'None'}`,
    `- UI interpretation: ${params.analysis.uiInterpretation || 'Not a UI screenshot or not sure'}`,
    `- Suggested explanation: ${params.analysis.suggestedExplanation || 'Explain the image simply and naturally.'}`,
    `- Confidence: ${params.analysis.confidence || 'medium'}`,
  ];

  return lines.join('\n');
}

export async function analyzeUploadedImageForMvp(params: {
  filePath: string;
  contentType?: string;
  latestMessage: string;
  analyzer?: (params: { filePath: string; contentType?: string; latestMessage: string }) => Promise<ImageAttachmentAnalysis>;
}): Promise<ImageAttachmentAnalysis> {
  if (params.analyzer) {
    return params.analyzer({
      filePath: params.filePath,
      contentType: params.contentType,
      latestMessage: params.latestMessage,
    });
  }

  const message = normalize(params.latestMessage || '');

  return {
    summary: message
      ? `An uploaded image was provided together with the message: ${message}`
      : 'An uploaded image was provided by the child.',
    visibleText: [],
    objects: [],
    uiInterpretation: 'Real vision analysis has not been connected yet in the multimodal pipeline skeleton.',
    suggestedExplanation: message
      ? 'Acknowledge the uploaded image and explain that image understanding is being prepared, then answer any text question as far as possible.'
      : 'Acknowledge the uploaded image warmly and say you are getting ready to understand pictures better.',
    confidence: 'low',
  };
}
