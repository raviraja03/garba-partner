import { Link } from 'react-router';
import { APP_NAME, APP_TAGLINE } from '@garba-partner/shared';
import { LogoIcon } from './Logo';
import { PAGE_GUTTER } from './PageContainer';
import { cx } from './ui/cx';

/*
 * Only pages that exist are linked: a footer must never contain a broken link. There are no
 * About, Privacy, Terms or Contact pages yet; add them to a "Company" / "Legal" group here
 * when they are written. Until then the community guidelines are the published rules.
 */
const LINK_GROUPS = [
  {
    title: 'Product',
    links: [{ to: '/events', label: 'Garba events' }],
  },
  {
    title: 'Safety',
    links: [{ to: '/safety', label: 'Safety centre' }],
  },
  {
    title: 'Rules',
    links: [{ to: '/guidelines', label: 'Community guidelines' }],
  },
] as const;

/** Signed-in members also get their own destinations (they would bounce visitors to login). */
const MEMBER_LINKS = [
  { to: '/discover', label: 'Find a partner' },
  { to: '/bookings', label: 'My passes' },
] as const;

const LINK_CLASS =
  'inline-flex min-h-11 items-center text-small text-white/80 underline-offset-4 transition-colors hover:text-white hover:underline lg:min-h-9';

/**
 * Deep Purple footer. The full logo's wordmark is purple, so the app icon and the name in
 * plain text are used here instead (see Logo.tsx).
 *
 * `tabBarOffset`: leave room for the mobile tab bar, which is fixed over the page bottom.
 */
export function Footer({
  member = false,
  tabBarOffset = false,
  className,
}: {
  member?: boolean;
  tabBarOffset?: boolean;
  className?: string;
}) {
  return (
    <footer
      className={cx(
        'mt-auto bg-primary text-white',
        tabBarOffset && 'pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0',
        className,
      )}
    >
      <div
        className={cx(
          'mx-auto grid max-w-page grid-cols-2 gap-x-6 gap-y-8 py-10 sm:grid-cols-3 lg:grid-cols-[2fr_1fr_1fr_1fr] lg:py-14',
          PAGE_GUTTER,
        )}
      >
        <div className="col-span-2 sm:col-span-3 lg:col-span-1">
          <div className="flex items-center gap-3">
            <LogoIcon decorative className="size-12" />
            <p className="text-h2 text-white">{APP_NAME}</p>
          </div>
          <p className="mt-3 font-semibold text-accent-yellow">{APP_TAGLINE}</p>
          <p className="mt-1 max-w-xs text-small text-white/80">
            Meet people who love Garba as much as you do.
          </p>
        </div>
        {LINK_GROUPS.map((group) => (
          <nav key={group.title} aria-label={group.title}>
            <h2 className="text-label tracking-wide text-white/60 uppercase">{group.title}</h2>
            <ul className="mt-1">
              {[...group.links, ...(member && group.title === 'Product' ? MEMBER_LINKS : [])].map(
                (link) => (
                  <li key={link.to}>
                    <Link to={link.to} className={LINK_CLASS}>
                      {link.label}
                    </Link>
                  </li>
                ),
              )}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-white/15">
        <p
          className={cx(
            'mx-auto flex max-w-page flex-wrap justify-between gap-x-6 gap-y-1 py-4 text-caption text-white/70',
            PAGE_GUTTER,
          )}
        >
          <span>
            © {new Date().getFullYear()} {APP_NAME}
          </span>
          <span>For adults (18+) only</span>
        </p>
      </div>
    </footer>
  );
}
