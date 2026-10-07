import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';

/*
 * Modal and Drawer are both a native <dialog>: the browser gives us the focus trap, Escape to
 * close, the inert page behind and the backdrop, so no library is needed.
 */

type Placement = 'center' | 'right' | 'bottom';

const PANEL: Record<Placement, string> = {
  // A bottom sheet on phones, a centred card from `sm` up.
  center:
    'mt-auto mb-0 w-full max-w-none rounded-t-card motion-safe:animate-sheet-up sm:m-auto sm:max-w-md sm:rounded-card sm:motion-safe:animate-pop-in',
  right:
    'mr-0 ml-auto h-dvh max-h-none w-[min(22rem,88vw)] rounded-l-card motion-safe:animate-drawer-in',
  bottom: 'mt-auto mb-0 w-full max-w-none rounded-t-card motion-safe:animate-sheet-up',
};

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Hide the title visually (it still names the dialog for screen readers). */
  hideTitle?: boolean;
  description?: ReactNode;
  children?: ReactNode;
  /** Actions, pinned to the bottom of the dialog. */
  footer?: ReactNode;
  className?: string;
}

function Dialog({
  open,
  onClose,
  title,
  hideTitle = false,
  description,
  children,
  footer,
  placement,
  className,
}: DialogProps & { placement: Placement }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Clicking the backdrop closes the dialog: that click lands on the <dialog> element itself.
  // (Keyboard users close it with Escape or the Close button.)
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onBackdropClick = (event: MouseEvent) => {
      if (event.target === dialog) onClose();
    };
    dialog.addEventListener('click', onBackdropClick);
    return () => {
      dialog.removeEventListener('click', onBackdropClick);
    };
  }, [onClose]);

  // The page behind must not scroll while a dialog is open.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      // Fires for Escape and for dialog.close(): keeps the parent's state in sync.
      onClose={onClose}
      className={cx(
        'max-h-[90dvh] flex-col overflow-hidden bg-card p-0 text-ink shadow-overlay backdrop:bg-brand-900/50 backdrop:motion-safe:animate-fade-in open:flex',
        PANEL[placement],
        className,
      )}
    >
      <header
        className={cx(
          'flex items-start justify-between gap-4 px-5 pt-5',
          hideTitle && !description ? 'pb-0' : 'pb-3',
        )}
      >
        <div className="min-w-0">
          <h2 id={titleId} className={hideTitle ? 'sr-only' : 'text-h3'}>
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="mt-1 text-small text-muted">
              {description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mt-1.5 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-brand-50 hover:text-ink"
        >
          <Icon name="close" />
        </button>
      </header>
      {children && <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>}
      {footer && (
        <footer className="flex flex-col-reverse gap-3 border-t border-line px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
          {footer}
        </footer>
      )}
    </dialog>
  );
}

/**
 * A focused task or a confirmation. Centred on desktop and tablet, a bottom sheet on phones.
 *
 *   <Modal open={open} onClose={close} title="Block Asha?"
 *     description="You won't see each other anywhere on GarbaMates."
 *     footer={<><Button variant="secondary" onClick={close}>Cancel</Button>
 *              <Button variant="danger" onClick={block}>Block</Button></>} />
 */
export function Modal(props: DialogProps) {
  return <Dialog placement="center" {...props} />;
}

/** A side panel (`right`: navigation, details) or a bottom sheet (`bottom`: mobile filters). */
export function Drawer({ side = 'right', ...props }: DialogProps & { side?: 'right' | 'bottom' }) {
  return <Dialog placement={side} {...props} />;
}
