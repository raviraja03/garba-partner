import type { ReactNode } from 'react';

/** The app's icon set: 24×24, drawn with the current text colour. Add new icons here. */
const PATHS = {
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  'chevron-down': <path d="M6 9l6 6 6-6" />,
  'chevron-right': <path d="M9 6l6 6-6 6" />,
  'arrow-left': <path d="M19 12H5m6-6l-6 6 6 6" />,
  home: <path d="M4 11l8-7 8 7v8a1 1 0 01-1 1h-4v-6h-6v6H5a1 1 0 01-1-1v-8z" />,
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M8 3v4M16 3v4" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" />
    </>
  ),
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" />,
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0113 0M16 4.6a3.5 3.5 0 010 6.8M18 14.5a6.5 6.5 0 013.5 5.5" />
    </>
  ),
  chat: <path d="M5 5h14a1 1 0 011 1v10a1 1 0 01-1 1h-7l-5 4v-4H5a1 1 0 01-1-1V6a1 1 0 011-1z" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0116 0" />
    </>
  ),
  bell: <path d="M6 9a6 6 0 0112 0c0 6 2 7 2 7H4s2-1 2-7zm4 10a2 2 0 004 0" />,
  shield: <path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.800-1-8-4.5-8-9V6l8-3z" />,
  alert: <path d="M12 4l9 16H3l9-16zm0 6v4m0 3v.01" />,
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
  logout: <path d="M10 5H6a1 1 0 00-1 1v12a1 1 0 001 1h4m5-4l3-3-3-3m3 3H10" />,
  pin: (
    <>
      <path d="M12 21s7-6.2 7-11.5a7 7 0 10-14 0C5 14.800 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.500" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  external: <path d="M14 5h5v5m0-5l-8 8M10 6H6a1 1 0 00-1 1v11a1 1 0 001 1h11a1 1 0 001-1v-4" />,
  ticket: (
    <path d="M4 8a1 1 0 011-1h14a1 1 0 011 1v2a2 2 0 000 4v2a1 1 0 01-1 1H5a1 1 0 01-1-1v-2a2 2 0 000-4V8zm10-1v10" />
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

/**
 * Decorative by default (hidden from screen readers): pair it with visible text, or give the
 * surrounding button an `aria-label`. Pass `label` only when the icon alone carries meaning.
 */
export function Icon({
  name,
  className = 'size-5',
  label,
}: {
  name: IconName;
  className?: string;
  label?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {PATHS[name]}
    </svg>
  );
}
