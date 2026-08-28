import Link from 'next/link';
import { FEATURES, Feature } from '@/lib/features';

function FeatureCard({ f }: { f: Feature }) {
  const content = (
    <div className={`feature-card${f.href ? '' : ' disabled'}`}>
      <div className="feature-icon" style={{ background: f.gradient }}>
        <span>{f.emoji}</span>
      </div>
      <div className="feature-name">{f.name}</div>
      <div className="feature-status">{f.href ? 'Available' : f.note || 'Not built yet'}</div>
    </div>
  );
  return f.href ? <Link href={f.href}>{content}</Link> : content;
}

export default function HomePage() {
  const categories: Feature['category'][] = ['Photo', 'Video', 'Design', 'Utilities'];

  return (
    <div className="app-shell">
      <header className="top-header">
        <div className="brand">
          <span className="brand-title">4K & 8K Photo Video Editor</span>
          <span className="brand-tagline">Create · Edit · Enhance · Upscale</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/search" className="icon-btn" aria-label="Search">🔍</Link>
          <Link href="/history" className="icon-btn" aria-label="History">☰</Link>
        </div>
      </header>

      {categories.map((cat) => {
        const items = FEATURES.filter((f) => f.category === cat);
        if (items.length === 0) return null;
        return (
          <section key={cat}>
            <div className="section-title">{cat}</div>
            <div className="feature-grid">
              {items.map((f) => <FeatureCard key={f.slug} f={f} />)}
            </div>
          </section>
        );
      })}

      <nav className="bottom-nav">
        <Link href="/" className="nav-item active"><span>🏠</span>Home</Link>
        <Link href="/tools/text-to-image" className="nav-item"><span>➕</span>Create</Link>
        <Link href="/search" className="nav-item"><span>🧩</span>Templates</Link>
        <Link href="/tools/upscaler" className="nav-item"><span>⚡</span>Enhance</Link>
        <Link href="/history" className="nav-item"><span>⋯</span>More</Link>
      </nav>
    </div>
  );
}
