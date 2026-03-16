import Link from 'next/link';
import { getConfiguredKids } from '@/lib/kid-settings';
import { ThemeToggle } from '@/components/theme-toggle';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const kids = await getConfiguredKids();

  return (
    <main className="shell home">
      <section className="hero hero-kids">
        <div className="hero-topbar">
          <div>
            <h1>选择你自己</h1>
            <p>点自己的名字卡片，输入 4 位 PIN，就可以进入自己的聊天小世界。</p>
          </div>
          <ThemeToggle />
        </div>
      </section>

      <section className="kid-grid">
        {kids.map((kid) => (
          <article key={kid.id} className="kid-card kid-card-friendly">
            <div className="kid-badge kid-badge-large" style={{ background: kid.accentColor }}>
              {kid.emoji || kid.name.slice(0, 1)}
            </div>
            <h2>{kid.name}</h2>
            <p>{kid.title}</p>
            <Link href={`/kid/${kid.id}`} className="kid-link kid-link-large" style={{ background: kid.accentColor }}>
              我是 {kid.name}
            </Link>
          </article>
        ))}
      </section>
    </main>
  );
}
