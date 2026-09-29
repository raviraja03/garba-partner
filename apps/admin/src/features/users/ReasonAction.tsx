import { useId, useState, type FormEvent } from 'react';
import { LIMITS } from '@garba-partner/shared';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';

/**
 * A moderation button that asks for a reason (recorded in the audit log) before running.
 * The API enforces the permission and the reason length regardless of this UI.
 */
export function ReasonAction({
  label,
  confirmLabel = 'Confirm',
  hint,
  danger = false,
  compact = false,
  onConfirm,
}: {
  label: string;
  confirmLabel?: string;
  hint?: string;
  danger?: boolean;
  compact?: boolean;
  onConfirm: (reason: string) => Promise<unknown>;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reason.trim().length < LIMITS.ADMIN_ACTION_REASON_MIN) {
      setError(
        `Please give a reason of at least ${String(LIMITS.ADMIN_ACTION_REASON_MIN)} characters.`,
      );
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      setOpen(false);
      setReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <Button
        variant={compact ? 'link' : 'secondary'}
        className={`${compact ? '' : 'w-auto! px-4 py-2!'} text-sm ${danger ? 'text-danger!' : ''}`}
        onClick={() => {
          setOpen(true);
        }}
      >
        {label}
      </Button>
    );
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="w-full space-y-2 rounded-xl bg-red-50 p-3"
    >
      <label htmlFor={id} className="block text-sm font-semibold">
        Reason (recorded in the audit log)
      </label>
      <textarea
        id={id}
        rows={2}
        maxLength={LIMITS.ADMIN_ACTION_REASON_MAX}
        value={reason}
        onChange={(event) => {
          setReason(event.target.value);
        }}
        className="w-full rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-black/10"
      />
      {hint && <p className="text-xs text-muted">{hint}</p>}
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex gap-3">
        <Button type="submit" className="w-auto! px-4 py-2! text-sm" loading={pending}>
          {confirmLabel}
        </Button>
        <Button
          variant="link"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
