import { promises as fs } from 'fs';
import { AppError } from './app-error';
import type { ImageAttachmentAnalysis } from './types';

const DEFAULT_GATEWAY_URL = 'http://127.0.0.1:18789';
const gatewayUrl = (process.env.OPENCLAW_GATEWAY_HTTP_URL || DEFAULT_GATEWAY_URL).replace(/\/$/, '');
let cachedGatewayToken: string | null = null;

function normalizeLineArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

async function readGatewayToken(): Promise<string> {
  if (cachedGatewayToken) return cachedGatewayToken;

  const envToken = process.env.OPENCLAW_GATEWAY_TOKEN?.trim();
  if (envToken) {
    cachedGatewayToken = envToken;
    return envToken;
  }

  try {
    const raw = await fs.readFile('/Users/jason/.openclaw/openclaw.json', 'utf8');
    const match = raw.match(/token:\s*'([^']+)'/) || raw.match(/"token"\s*:\s*"([^"]+)"/);
    const token = match?.[1]?.trim();
    if (token) {
      cachedGatewayToken = token;
      return token;
    }
  } catch {
    // fall through
  }

  throw new AppError('找不到 OpenClaw Gateway token，无法调用真实图片理解。', 500);
}

function stripFenceBlock(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function extractTextFromOpenAiContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'text' in item && typeof (item as { text?: unknown }).text === 'string') {
          return String((item as { text?: unknown }).text);
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

export async function analyzeUploadedImageViaGateway(params: {
  agentId: string;
  filePath: string;
  contentType?: string;
  latestMessage: string;
  kidName: string;
}): Promise<ImageAttachmentAnalysis> {
  const token = await readGatewayToken();
  const imageBuffer = await fs.readFile(params.filePath);
  const mimeType = params.contentType || 'image/jpeg';
  const dataUrl = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;

  const instruction = [
    'Analyze this uploaded image for a child-oriented chat assistant.',
    'Be accurate, grounded, and cautious when uncertain.',
    'If there is visible text, extract it.',
    'If it is a UI screenshot, explain what screen it appears to be, what state it is in, and what the user can likely do next.',
    'Return JSON only with this exact shape:',
    '{',
    '  "summary": string,',
    '  "visibleText": string[],',
    '  "objects": string[],',
    '  "uiInterpretation": string,',
    '  "suggestedExplanation": string,',
    '  "confidence": "low" | "medium" | "high"',
    '}',
    '',
    `Kid name: ${params.kidName}`,
    `Child message: ${params.latestMessage || '(none)'}`,
  ].join('\n');

  const response = await fetch(`${gatewayUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-openclaw-agent-id': params.agentId,
      'x-openclaw-session-key': `agent:${params.agentId}:kid-chat-vision`,
    },
    body: JSON.stringify({
      model: `openclaw:${params.agentId}`,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: instruction },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      stream: false,
      user: `kid-chat-vision-${params.agentId}`,
    }),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new AppError(`真实图片理解调用失败：${raw || `HTTP ${response.status}`}`, 502);
  }

  let parsedResponse: unknown;
  try {
    parsedResponse = JSON.parse(raw);
  } catch {
    throw new AppError('图片理解返回了无法解析的响应。', 502);
  }

  const choice = (parsedResponse as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0];
  const text = stripFenceBlock(extractTextFromOpenAiContent(choice?.message?.content));

  if (!text) {
    throw new AppError('图片理解返回了空结果。', 502);
  }

  try {
    const analysis = JSON.parse(text) as Record<string, unknown>;
    const confidence = analysis.confidence === 'low' || analysis.confidence === 'medium' || analysis.confidence === 'high'
      ? analysis.confidence
      : 'medium';

    return {
      summary: typeof analysis.summary === 'string' ? analysis.summary.trim() : 'Image uploaded.',
      visibleText: normalizeLineArray(analysis.visibleText),
      objects: normalizeLineArray(analysis.objects),
      uiInterpretation: typeof analysis.uiInterpretation === 'string' ? analysis.uiInterpretation.trim() : '',
      suggestedExplanation: typeof analysis.suggestedExplanation === 'string' ? analysis.suggestedExplanation.trim() : '',
      confidence,
    };
  } catch {
    return {
      summary: text,
      visibleText: [],
      objects: [],
      uiInterpretation: '',
      suggestedExplanation: 'Explain the uploaded image simply and naturally based on the grounded analysis above.',
      confidence: 'medium',
    };
  }
}
