import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';

export interface DropdownItem {
  key: string;
  label: string;
  icon?: IconName;
  /** A route to open, or … */
  to?: string;
  /** … an action to run. */
  onSelect?: () => void;
  tone?: 'default' | 'danger';
}

const ITEM_CLASS =
  'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-small font-medium outline-none transition-colors hover:bg-brand-50 focus-visible:bg-brand-50';

/**
 * A menu that opens from a button (account menu, "more actions"). Keyboard: Enter/Space or
 * ArrowDown opens, arrows move, Escape closes and returns focus to the button.
 */
export function Dropdown({
  label,
  trigger,
  items,
  align = 'right',
  triggerClassName,
}: {
  /** Accessible name of the trigger button. */
  label: string;
  trigger: ReactNode;
  items: DropdownItem[];
  align?: 'left' | 'right';
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const focusItem = (index: number) => {
    const nodes = rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    if (!nodes || nodes.length === 0) return;
    nodes[(index + nodes.length) % nodes.length]?.focus();
  };

  useEffect(() => {
    if (!open) return;
    focusItem(0);
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const nodes = Array.from(
      rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    const current = nodes.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusItem(current + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusItem(current - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusItem(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusItem(nodes.length - 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          setOpen((value) => !value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={cx(
          'flex min-h-11 items-center gap-1.5 rounded-full px-2 text-small font-semibold text-brand-700 transition-colors hover:bg-brand-50',
          triggerClassName,
        )}
      >
        {trigger}
        <Icon
          name="chevron-down"
          className={cx('size-4 transition-transform duration-150', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
          className={cx(
            'absolute z-40 mt-2 min-w-52 rounded-control bg-card p-1.5 shadow-raised ring-1 ring-brand-900/10 motion-safe:animate-pop-in',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item) => {
            const className = cx(ITEM_CLASS, item.tone === 'danger' ? 'text-danger' : 'text-ink');
            const content = (
              <>
                {item.icon && <Icon name={item.icon} className="size-4.5 opacity-70" />}
                {item.label}
              </>
            );
            return item.to ? (
              <Link
                key={item.key}
                to={item.to}
                role="menuitem"
                className={className}
                onClick={() => {
                  close(false);
                }}
              >
                {content}
              </Link>
            ) : (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                className={className}
                onClick={() => {
                  close();
                  item.onSelect?.();
                }}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
