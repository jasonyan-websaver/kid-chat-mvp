export type KidProfile = {
  id: string;
  name: string;
  title: string;
  agentId: string;
  accentColor: string;
  emoji?: string;
  welcome: string;
};

export type ChatSummary = {
  id: string;
  title: string;
  updatedAt: string;
  preview: string;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};
