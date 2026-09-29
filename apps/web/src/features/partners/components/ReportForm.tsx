import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { LIMITS, REPORT_REASONS, type ReportReason } from '@garba-partner/shared';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { REPORT_REASON_LABELS } from '../../../lib/labels';
import { useReportMember } from '../hooks';

/**
 * Report a member, optionally about one chat message (the message and earlier context are
 * attached as evidence on the server). The reported member is never told who reported them.
 */
export function ReportForm({
  userId,
  name,
  messageId,
  messagePreview,
  onDone,
  onCancel,
  initialReason,
}: {
  userId: string;
  name: string;
  messageId?: string;
  messagePreview?: string;
  onDone: (message: string) => void;
  onCancel: () => void;
  /** Pre-selected reason (e.g. from a scam warning). */
  initialReason?: ReportReason;
}) {
  const id = useId();
  const report = useReportMember();
  const [reason, setReason] = useState<ReportReason | ''>(initialReason ?? '');
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason) {
      setError('Choose a reason.');
      return;
    }
    setError(null);
    try {
      await report.mutateAsync({
        reportedUserId: userId,
        reason,
        ...(details.trim() ? { details: details.trim() } : {}),
        ...(messageId ? { messageId } : {}),
        alsoBlock,
      });
      onDone('Thank you. Our team will review your report. They won’t be told who reported them.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the report.');
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="space-y-3 rounded-card bg-white p-4 shadow-sm ring-1 ring-black/5"
    >
      <h2 className="font-semibold">{messageId ? 'Report this message' : `Report ${name}`}</h2>
      {messagePreview && (
        <blockquote className="rounded-xl bg-black/5 px-3 py-2 text-sm whitespace-pre-wrap">
          {messagePreview}
        </blockquote>
      )}
      <fieldset className="space-y-1">
        <legend className="text-sm font-semibold">
          What happened?{' '}
          <Link to="/guidelines" className="font-normal text-brand-700 underline">
            Community guidelines
          </Link>
        </legend>
        {REPORT_REASONS.map((value) => (
          <label key={value} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={`${id}-reason`}
              value={value}
              checked={reason === value}
              onChange={() => {
                setReason(value);
              }}
            />
            {REPORT_REASON_LABELS[value]}
          </label>
        ))}
      </fieldset>
      <label htmlFor={`${id}-details`} className="block text-sm font-semibold">
        Details <span className="font-normal text-muted">(optional)</span>
      </label>
      <textarea
        id={`${id}-details`}
        rows={3}
        maxLength={LIMITS.REPORT_DETAILS_MAX_LENGTH}
        value={details}
        onChange={(e) => {
          setDetails(e.target.value);
        }}
        className="w-full rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-black/10"
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={alsoBlock}
          onChange={(e) => {
            setAlsoBlock(e.target.checked);
          }}
        />
        Also block {name}
      </label>
      <p className="text-xs text-muted">
        Reporting ends this chat. If you are in danger right now, call 112 (India emergency
        services).
      </p>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex gap-3">
        <Button type="submit" className="w-auto! px-5" loading={report.isPending}>
          Send report
        </Button>
        <Button variant="link" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
