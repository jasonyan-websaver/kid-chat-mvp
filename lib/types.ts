export type KidTtsSettings = {
  enabled: boolean;
  preferredVoiceName?: string;
  rate: number;
};

export type KidCapabilities = {
  imageGeneration: boolean;
  imageUnderstanding: boolean;
  imageEdit: boolean;
};

export type KidRewardSettings = {
  enabled: boolean;
  defaultType: string;
  certificateTitle?: string;
  imageThemes?: string[];
  encouragementStyle?: string;
};

export type KidProfile = {
  id: string;
  name: string;
  title: string;
  agentId: string;
  accentColor: string;
  emoji?: string;
  welcome: string;
  tts?: KidTtsSettings;
  capabilities?: KidCapabilities;
  rewardSettings?: KidRewardSettings;
};

export type ChatSummary = {
  id: string;
  title: string;
  updatedAt: string;
  preview: string;
};

export type ImageAttachmentAnalysis = {
  summary?: string;
  visibleText?: string[];
  objects?: string[];
  uiInterpretation?: string;
  suggestedExplanation?: string;
  confidence?: 'low' | 'medium' | 'high';
};

export type ChatAttachmentBase = {
  id?: string;
  url: string;
  contentType?: string;
  source?: 'upload' | 'generated' | 'reference';
  width?: number;
  height?: number;
};

export type ChatImageInputAttachment = ChatAttachmentBase & {
  kind: 'image_input';
  prompt?: string;
  analysis?: ImageAttachmentAnalysis;
};

export type ChatImageGeneratedAttachment = ChatAttachmentBase & {
  kind: 'image_generated';
  prompt?: string;
  revisedPrompt?: string;
  generationStatus?: 'pending' | 'completed' | 'failed';
  provider?: string;
  model?: string;
};

export type ChatAttachment = ChatImageInputAttachment | ChatImageGeneratedAttachment;

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  attachments?: ChatAttachment[];
  meta?: {
    kind?: 'french-writing-task' | 'french-writing-evaluation' | 'french-writing-reward';
    taskId?: string;
    taskStatus?: 'assigned' | 'completed';
    taskTopic?: string;
    targetLength?: number;
    completed?: boolean;
  };
  /** @deprecated Use attachments[] instead. Kept only for backward compatibility with older stored chats. */
  attachment?: {
    type: 'image';
    url: string;
    contentType?: string;
  };
};

export function getMessageAttachments(message: ChatMessage): ChatAttachment[] {
  if (Array.isArray(message.attachments) && message.attachments.length > 0) {
    return message.attachments;
  }

  if (message.attachment?.type === 'image') {
    return [
      {
        kind: 'image_input',
        url: message.attachment.url,
        contentType: message.attachment.contentType,
        source: 'upload',
      },
    ];
  }

  return [];
}

export function getFirstImageAttachment(message: ChatMessage): ChatAttachment | null {
  return getMessageAttachments(message).find((attachment) => attachment.kind === 'image_input' || attachment.kind === 'image_generated') || null;
}
