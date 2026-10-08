import type { KeyboardEvent } from 'react';
import { cx } from './cx';

export interface TabItem<T extends string> {
  value: T;
  label: string;
  /** Optional count shown after the label. */
  count?: number | undefined;
}

/**
 * Segmented tabs for switching between two or three views of one page. Arrow keys move
 * between tabs (the WAI-ARIA tabs pattern); only the selected tab is in the tab order.
 * Give the panel `role="tabpanel"` and `aria-label` of the selected tab.
 */
export function Tabs<T extends string>({
  label,
  items,
  value,
  onChange,
}: {
  /** Names the tab list for screen readers. */
  label: string;
  items: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const index = items.findIndex((item) => item.value === value);
    const next =
      items[(index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length];
    if (!next) return;
    onChange(next.value);
    const buttons =
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[items.indexOf(next)]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className="inline-flex max-w-full gap-1 rounded-full bg-brand-100 p-1"
    >
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onKeyDown={onKeyDown}
            onClick={() => {
              onChange(item.value);
            }}
            className={cx(
              'flex min-h-11 items-center gap-2 rounded-full px-5 text-small font-semibold transition-colors duration-150',
              selected ? 'bg-card text-primary shadow-card' : 'text-brand-700 hover:bg-brand-50',
            )}
          >
            {item.label}
            {item.count !== undefined && item.count > 0 && (
              <span
                className={cx(
                  'flex min-w-5 items-center justify-center rounded-full px-1.5 text-[0.75rem] leading-5 font-bold',
                  selected ? 'bg-accent-600 text-white' : 'bg-brand-200 text-brand-800',
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
