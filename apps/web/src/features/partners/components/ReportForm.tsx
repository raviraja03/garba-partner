import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { LIMITS, REPORT_REASONS, type ReportReason } from '@garba-partner/shared';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { CARD_CLASS } from '../../../components/ui/Card';
import { Choice, Textarea } from '../../../components/ui/Input';
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
  plain = false,
}: {
  userId: string;
  name: string;
  messageId?: string;
  messagePreview?: string;
  onDone: (message: string) => void;
  onCancel: () => void;
  /** Pre-selected reason (e.g. from a scam warning). */
  initialReason?: ReportReason;
  /** No card around the form (when it is shown inside a dialog). */
  plain?: boolean;
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
      className={plain ? 'space-y-4 pt-2' : `${CARD_CLASS} space-y-4 p-5`}
    >
      <h2 className="text-h3">{messageId ? 'Report this message' : `Report ${name}`}</h2>
      {messagePreview && (
        <blockquote className="rounded-control bg-brand-900/5 px-3 py-2 text-small whitespace-pre-wrap">
          {messagePreview}
        </blockquote>
      )}
      <fieldset>
        <legend className="text-label">What happened?</legend>
        <div className="mt-1">
          {REPORT_REASONS.map((value) => (
            <Choice
              key={value}
              type="radio"
              name={`${id}-reason`}
              value={value}
              label={REPORT_REASON_LABELS[value]}
              checked={reason === value}
              onChange={() => {
                setReason(value);
              }}
            />
          ))}
        </div>
        <p className="mt-1 text-caption text-muted">
          See the{' '}
          <Link to="/guidelines" className="font-semibold text-brand-700 underline">
            community guidelines
          </Link>
          .
        </p>
      </fieldset>
      <div>
        <label htmlFor={`${id}-details`} className="block text-label">
          Details <span className="font-normal text-muted">(optional)</span>
        </label>
        <Textarea
          id={`${id}-details`}
          rows={3}
          maxLength={LIMITS.REPORT_DETAILS_MAX_LENGTH}
          value={details}
          onChange={(e) => {
            setDetails(e.target.value);
          }}
        />
      </div>
      <Choice
        label={`Also block ${name}`}
        checked={alsoBlock}
        onChange={(e) => {
          setAlsoBlock(e.target.checked);
        }}
      />
      <p className="text-caption text-muted">
        Reporting ends this chat. If you are in danger right now, call 112 (India emergency
        services).
      </p>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" className="sm:w-auto" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="danger" className="sm:w-auto" loading={report.isPending}>
          Send report
        </Button>
      </div>
    </form>
  );
}
