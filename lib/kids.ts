import { KidProfile } from './types';

export const kids: KidProfile[] = [
  {
    id: 'grace',
    name: 'Grace',
    title: '故事和语言小助手',
    agentId: 'grace',
    accentColor: '#ec4899',
    emoji: '🌸',
    welcome: '你好，Grace！我可以陪你聊天、讲故事，也可以用中文或法语和你交流。',
  },
  {
    id: 'george',
    name: 'George',
    title: '科学和问答小助手',
    agentId: 'george',
    accentColor: '#3b82f6',
    emoji: '🚀',
    welcome: '你好，George！我们可以一起聊科学、提问题，也可以用中文或法语交流。',
  },
];

export function getKidById(id: string) {
  const normalized = String(id || '').trim().toLowerCase();
  return kids.find((kid) => kid.id === normalized) ?? null;
}

export function getAllKidIds() {
  return kids.map((kid) => kid.id);
}
