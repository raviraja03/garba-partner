import { useSyncExternalStore } from 'react';

/** True while the CSS media query matches. Use it when markup (not just styles) must differ. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => {
        list.removeEventListener('change', onChange);
      };
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Tailwind's `lg` breakpoint: the desktop layout (side panels, top navigation). */
export const useIsDesktop = () => useMediaQuery('(min-width: 64rem)');
