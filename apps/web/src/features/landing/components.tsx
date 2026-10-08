import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cx } from '../../components/ui/cx';
import type { Tint } from './content';

/** Soft background and icon colour for each brand tint (text on these is always dark). */
const TINT: Record<Tint, string> = {
  purple: 'bg-brand-100 text-brand-700',
  pink: 'bg-accent-100 text-accent-700',
  orange: 'bg-accent-orange-soft text-primary',
  yellow: 'bg-accent-yellow-soft text-primary',
};

/**
 * Fades its content up the first time it scrolls into view. Only opacity and transform change,
 * so nothing around it moves. With reduced motion (or no IntersectionObserver) the content is
 * simply there.
 */
export function Reveal({
  children,
  className,
  delayMs = 0,
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      style={delayMs ? { transitionDelay: `${String(delayMs)}ms` } : undefined}
      className={cx(
        'transition-[opacity,transform] duration-500 ease-soft motion-reduce:transition-none',
        shown
          ? 'translate-y-0 opacity-100'
          : 'translate-y-4 opacity-0 motion-reduce:translate-y-0 motion-reduce:opacity-100',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A landing-page section: an `h2`, optional intro, then its content. Named by its heading. */
export function Section({
  heading,
  intro,
  align = 'center',
  className,
  children,
}: {
  heading: string;
  intro?: ReactNode;
  align?: 'center' | 'left';
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={className}>
      <Reveal className={cx('max-w-2xl', align === 'center' && 'mx-auto text-center')}>
        <h2 id={id} className="text-h1 text-balance">
          {heading}
        </h2>
        {intro && <p className="mt-3 text-muted">{intro}</p>}
      </Reveal>
      <div className="mt-8">{children}</div>
    </section>
  );
}

/** Small square holding an icon or an emoji at the top of a card. Decorative. */
export function Tile({
  tint,
  children,
  className,
}: {
  tint: Tint;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'flex size-12 shrink-0 items-center justify-center rounded-2xl text-2xl',
        TINT[tint],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * The four-point sparkle from the logo, as a decoration. Colour comes from the text colour.
 * `float` adds a slow drift (off with reduced motion).
 */
export function Sparkle({ className, float = false }: { className?: string; float?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cx(
        'pointer-events-none absolute',
        float && 'motion-safe:animate-float',
        className,
      )}
      fill="currentColor"
    >
      <path d="M12 0c1 6.5 4.500 10 12 12-7.500 2-11 5.500-12 12-1-6.500-4.500-10-12-12 7.500-2 11-5.500 12-12z" />
    </svg>
  );
}
