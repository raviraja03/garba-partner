import { useId, useState, type FormEvent } from 'react';
import {
  LIMITS,
  REPORT_REASONS,
  SANCTION_DURATION_DAYS,
  type AdminSanctionInput,
  type ReportReason,
  type SanctionDurationDays,
} from '@garba-partner/shared';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { REASON_LABELS } from '../reports/labels';
import { DURATION_LABELS } from './labels';

/**
 * A sanction button that opens a small form: guideline category (shown to the member on a
 * warning), optional duration, and the internal reason (audit log, never shown to the member).
 * The API enforces permissions and validation regardless of this UI.
 */
export function SanctionForm({
  label,
  hint,
  withDuration = false,
  danger = false,
  confirmText,
  onSubmit,
}: {
  label: string;
  hint: string;
  withDuration?: boolean;
  danger?: boolean;
  /** Extra browser confirmation for irreversible actions. */
  confirmText?: string;
  onSubmit: (input: AdminSanctionInput) => Promise<unknown>;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonCode, setReasonCode] = useState<ReportReason>('other');
  const [duration, setDuration] = useState<SanctionDurationDays | ''>('');
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
    if (confirmText && !window.confirm(confirmText)) return;
    setPending(true);
    setError(null);
    try {
      await onSubmit({
        reason: reason.trim(),
        reasonCode,
        ...(withDuration && duration !== '' ? { durationDays: duration } : {}),
      });
      setOpen(false);
      setReason('');
      setDuration('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <Button
        variant="secondary"
        className={`w-auto! px-4 py-2! text-sm ${danger ? 'text-danger!' : ''}`}
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
      className="w-full space-y-2 rounded-xl bg-red-50 p-3 text-sm"
    >
      <p className="font-semibold">{label}</p>
      <p className="text-xs text-muted">{hint}</p>
      <div className="flex flex-wrap gap-3">
        <label className="space-y-1">
          <span className="block text-xs font-semibold">Guideline broken</span>
          <select
            value={reasonCode}
            onChange={(e) => {
              setReasonCode(e.target.value as ReportReason);
            }}
            className="rounded-lg bg-white px-2 py-1 ring-1 ring-black/10"
          >
            {REPORT_REASONS.map((value) => (
              <option key={value} value={value}>
                {REASON_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        {withDuration && (
          <label className="space-y-1">
            <span className="block text-xs font-semibold">Duration</span>
            <select
              value={duration === '' ? '' : String(duration)}
              onChange={(e) => {
                setDuration(
                  e.target.value === '' ? '' : (Number(e.target.value) as SanctionDurationDays),
                );
              }}
              className="rounded-lg bg-white px-2 py-1 ring-1 ring-black/10"
            >
              <option value="">Until lifted</option>
              {SANCTION_DURATION_DAYS.map((days) => (
                <option key={days} value={String(days)}>
                  {DURATION_LABELS[days]}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <label htmlFor={id} className="block font-semibold">
        Internal reason (audit log, never shown to the member)
      </label>
      <textarea
        id={id}
        rows={2}
        maxLength={LIMITS.ADMIN_ACTION_REASON_MAX}
        value={reason}
        onChange={(event) => {
          setReason(event.target.value);
        }}
        className="w-full rounded-xl bg-white px-3 py-2 ring-1 ring-black/10"
      />
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex gap-3">
        <Button type="submit" className="w-auto! px-4 py-2! text-sm" loading={pending}>
          Confirm
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
