import { promises as fs } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getKidById } from './kids';
import { getKidMemoryPath } from './kid-paths';

const execFileAsync = promisify(execFile);

function getMemoryPath(kidId: string) {
  return getKidMemoryPath(kidId);
}

function buildInitialMemory(kidId: string) {
  const kid = getKidById(kidId);
  const name = kid?.name || kidId;
  return `Long-term memory for ${name}\n\nThis file stores durable preferences and recurring interests learned over time.\n\n## Stable preferences\n`;
}

function extractJsonBlock(text: string) {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

async function generateMemoryCandidates(params: {
  kidId: string;
  userMessage: string;
  assistantMessage: string;
  currentMemory: string;
}) {
  const kidLabel = getKidById(params.kidId)?.name || params.kidId;

  const prompt = [
    `You are extracting durable long-term memory candidates for a child assistant named ${kidLabel}.`,
    'Only extract information that is likely to remain useful across future conversations.',
    'Good examples: recurring interests, favorite topics, preferred explanation style, learning goals, stable emotional tone preferences.',
    'Bad examples: one-off requests, temporary moods, small talk, details useful only for this single conversation.',
    'Avoid duplicates if the memory already appears in current memory.',
    'Return strict JSON only with this shape:',
    '{"shouldWrite":boolean,"items":["- memory line 1","- memory line 2"]}',
    'Each item must be a concise bullet line starting with "- ".',
    'If nothing durable should be written, return {"shouldWrite":false,"items":[]}.',
    '',
    'Current memory:',
    params.currentMemory || '(empty)',
    '',
    'Latest child message:',
    params.userMessage,
    '',
    'Latest assistant reply:',
    params.assistantMessage,
  ].join('\n');

  const { stdout } = await execFileAsync(
    'openclaw',
    ['agent', '--agent', params.kidId, '--message', prompt, '--json'],
    {
      maxBuffer: 1024 * 1024 * 5,
    },
  );

  const parsed = JSON.parse(stdout) as {
    result?: { payloads?: Array<{ text?: string | null }> };
  };

  const text = parsed.result?.payloads?.map((item) => item.text || '').join('\n').trim() || '';
  const jsonText = extractJsonBlock(text);
  if (!jsonText) {
    return { shouldWrite: false, items: [] as string[] };
  }

  try {
    const data = JSON.parse(jsonText) as { shouldWrite?: boolean; items?: string[] };
    const items = Array.isArray(data.items)
      ? data.items.filter((item) => typeof item === 'string' && item.trim().startsWith('- ')).map((item) => item.trim())
      : [];
    return {
      shouldWrite: data.shouldWrite === true && items.length > 0,
      items,
    };
  } catch {
    return { shouldWrite: false, items: [] as string[] };
  }
}

export async function updateAgentMemoryFromChat(params: {
  kidId: string;
  userMessage: string;
  assistantMessage: string;
}) {
  const memoryPath = getMemoryPath(params.kidId);
  if (!memoryPath) {
    return { updated: false, reason: 'unknown-kid' as const };
  }

  let current = '';
  try {
    current = await fs.readFile(memoryPath, 'utf8');
  } catch {
    current = buildInitialMemory(params.kidId);
  }

  const extraction = await generateMemoryCandidates({
    kidId: params.kidId,
    userMessage: params.userMessage,
    assistantMessage: params.assistantMessage,
    currentMemory: current,
  }).catch(() => ({ shouldWrite: false, items: [] as string[] }));

  if (!extraction.shouldWrite || extraction.items.length === 0) {
    return { updated: false, reason: 'no-candidates' as const };
  }

  const missing = extraction.items.filter((item) => !current.includes(item));
  if (missing.length === 0) {
    return { updated: false, reason: 'already-known' as const };
  }

  const nextContent = `${current.trimEnd()}\n${missing.join('\n')}\n`;
  await fs.writeFile(memoryPath, nextContent, 'utf8');
  return { updated: true, added: missing };
}
