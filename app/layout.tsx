import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '儿童聊天',
  description: '一个简单、适合孩子使用的 OpenClaw 聊天界面。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
