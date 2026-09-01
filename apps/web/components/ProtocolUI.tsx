import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, icon, action, status }: { eyebrow: string; title: string; description?: string; icon: ReactNode; action?: ReactNode; status?: ReactNode }) {
  return <header className="page-hero"><div className="page-hero-copy"><span className="page-icon">{icon}</span><div><p className="kicker">{eyebrow}</p><h1 className="page-title">{title}</h1>{description && <p className="page-description">{description}</p>}</div></div><div className="page-hero-actions">{status}{action}</div></header>;
}

export function MetricCard({ icon, label, value, hint, accent = false }: { icon: ReactNode; label: string; value: string; hint: string; accent?: boolean }) {
  return <article className={accent ? "glass metric-card metric-card-accent" : "glass metric-card"}><span className="metric-icon">{icon}</span><div className="metric-copy"><span>{label}</span><strong>{value}</strong><small>{hint}</small></div></article>;
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state-card"><span className="empty-icon">{icon}</span><div><h3>{title}</h3><p>{description}</p></div>{action}</div>;
}

export function SectionHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="section-title-row"><div><p className="kicker">{eyebrow}</p><h2>{title}</h2>{description && <p className="muted">{description}</p>}</div>{action}</div>;
}
