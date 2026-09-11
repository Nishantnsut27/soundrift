import type { ReactNode } from 'react';

interface ContentSectionAction {
  label: string;
  onClick: () => void;
}

interface ContentSectionProps {
  title: string;
  /** Optional editorial line under the title. Keep it to one short sentence. */
  subtitle?: string;
  /** Small uppercase label above the title, e.g. "Curated". */
  eyebrow?: string;
  /** Trailing affordance such as "See all". Omit when there is nowhere to go. */
  action?: ContentSectionAction;
  className?: string;
  children: ReactNode;
}

/**
 * Section chrome shared by every discovery surface: consistent heading level,
 * spacing and optional trailing action. Sections differ by their content and
 * copy, not by re-inventing their header each time.
 */
export function ContentSection({
  title,
  subtitle,
  eyebrow,
  action,
  className,
  children,
}: ContentSectionProps) {
  return (
    <section className={`content-section${className ? ` ${className}` : ''}`}>
      <header className="content-section-head">
        <div className="content-section-heading">
          {eyebrow && <p className="t-eyebrow">{eyebrow}</p>}
          <h2 className="t-h2 content-section-title">{title}</h2>
          {subtitle && <p className="t-meta content-section-subtitle">{subtitle}</p>}
        </div>

        {action && (
          <button type="button" className="sr-btn sr-btn-quiet" onClick={action.onClick}>
            {action.label}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}
      </header>

      <div className="content-section-body">{children}</div>
    </section>
  );
}
