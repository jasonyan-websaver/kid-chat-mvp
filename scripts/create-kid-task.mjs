#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

function nowIso() {
  return new Date().toISOString();
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const part = argv[i];
    if (!part.startsWith('--')) continue;
    const key = part.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = 'true';
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const kidId = String(args.kid || '').trim().toLowerCase();
  if (!kidId || !['george', 'grace'].includes(kidId)) {
    throw new Error('Usage: node scripts/create-kid-task.mjs --kid george|grace --topic rocket --words 20 [--topic-label "la fusée"] [--instructions "..."] [--reward-theme rocket] [--created-by dazhi]');
  }

  const topic = String(args.topic || 'rocket').trim();
  const topicLabel = String(args['topic-label'] || (topic === 'rocket' ? 'la fusée' : topic)).trim();
  const targetWordCount = Number(args.words || 20);
  const rewardTheme = String(args['reward-theme'] || topic || 'rocket').trim();
  const createdBy = String(args['created-by'] || 'dazhi').trim();
  const instructions = String(args.instructions || `Écris un petit texte en français sur le thème « ${topicLabel} », avec environ ${targetWordCount} mots. Quand tu auras terminé, tu recevras une magnifique image-récompense sur le thème de ${topicLabel}.`).trim();

  const workspaceDir = path.join(os.homedir(), '.openclaw', `workspace-${kidId}`);
  const inboxDir = path.join(workspaceDir, 'tasks', 'inbox');
  await fs.mkdir(inboxDir, { recursive: true });

  const taskId = `task-${Date.now()}`;
  const task = {
    id: taskId,
    type: 'french-writing',
    status: 'pending',
    topic,
    topicLabel,
    targetWordCount,
    rewardType: 'image',
    rewardTheme,
    instructions,
    createdBy,
    createdAt: nowIso(),
  };

  const filePath = path.join(inboxDir, `${taskId}.json`);
  await fs.writeFile(filePath, JSON.stringify(task, null, 2), 'utf8');
  process.stdout.write(`${JSON.stringify({ ok: true, kidId, filePath, task }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
