import { ChatMessage, ChatSummary } from './types';

export const mockChatSummaries: Record<string, ChatSummary[]> = {
  grace: [
    {
      id: 'story-time',
      title: '睡前故事',
      updatedAt: '今天 11:20',
      preview: '可以给我讲一个公主故事吗？',
    },
    {
      id: 'language-fun',
      title: '语言小游戏',
      updatedAt: '昨天',
      preview: '我们来练习动物词语吧。',
    },
  ],
  george: [
    {
      id: 'space-questions',
      title: '太空问题',
      updatedAt: '今天 10:05',
      preview: '为什么月亮会变形状？',
    },
    {
      id: 'science-fun',
      title: '科学小实验',
      updatedAt: '昨天',
      preview: '冰融化的时候会发生什么？',
    },
  ],
};

export const mockMessages: Record<string, ChatMessage[]> = {
  'grace:story-time': [
    {
      id: 'g1',
      role: 'assistant',
      content: '你好 Grace！今天想听一个温柔的公主故事，还是一个魔法冒险故事？',
      createdAt: '11:19',
    },
    {
      id: 'g2',
      role: 'user',
      content: '请讲一个公主故事！',
      createdAt: '11:20',
    },
    {
      id: 'g3',
      role: 'assistant',
      content: '从前，有一位勇敢的小公主，她最喜欢在星空下安静地读书……',
      createdAt: '11:20',
    },
  ],
  'george:space-questions': [
    {
      id: 'b1',
      role: 'assistant',
      content: '你好 George！你今天想问太空问题，还是想听一个有趣的科学事实？',
      createdAt: '10:04',
    },
    {
      id: 'b2',
      role: 'user',
      content: '为什么月亮会变形状？',
      createdAt: '10:05',
    },
    {
      id: 'b3',
      role: 'assistant',
      content: '月亮其实没有真的变形，只是我们从地球上看到它被太阳照亮的部分不一样。',
      createdAt: '10:05',
    },
  ],
};
