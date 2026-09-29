import { useState, type FormEvent } from 'react';
import { LIMITS, REPORT_REASONS, type ReportReason } from '@garba-partner/shared';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { REPORT_REASON_LABELS } from '../../../lib/labels';
import { useBlockMember, useReportMember } from '../hooks';

/**
 * Block and Report, available on every partner profile. Both are silent: the other member is
 * never told. After either action the member disappears from discovery.
 */
export function SafetyActions({
  userId,
  name,
  onDone,
}: {
  userId: string;
  name: string;
  onDone: (message: string) => void;
}) {
  const block = useBlockMember();
  const report = useReportMember();
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function handleBlock() {
    if (!window.confirm(`Block ${name}? You won't see each other anywhere on Garba Partner.`)) {
      return;
    }
    setError(null);
    try {
      await block.mutateAsync(userId);
      onDone(`${name} is blocked. They won't be told.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not block. Please try again.');
    }
  }

  async function handleReport(event: FormEvent<HTMLFormElement>) {
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
        alsoBlock,
      });
      onDone('Thank you. Our team will review your report. They won’t be told who reported them.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the report.');
    }
  }

  return (
    <section aria-label="Safety" className="space-y-3">
      {!reporting ? (
        <div className="flex gap-4">
          <Button variant="link" loading={block.isPending} onClick={() => void handleBlock()}>
            Block
          </Button>
          <Button
            variant="link"
            className="text-danger!"
            onClick={() => {
              setReporting(true);
            }}
          >
            Report
          </Button>
        </div>
      ) : (
        <form
          onSubmit={(event) => void handleReport(event)}
          className="space-y-3 rounded-card bg-white p-4 shadow-sm ring-1 ring-black/5"
        >
          <h2 className="font-semibold">Report {name}</h2>
          <fieldset className="space-y-1">
            <legend className="text-sm font-semibold">What happened?</legend>
            {REPORT_REASONS.map((value) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="report-reason"
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
          <label htmlFor="report-details" className="block text-sm font-semibold">
            Details <span className="font-normal text-muted">(optional)</span>
          </label>
          <textarea
            id="report-details"
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
            If you are in danger right now, call 112 (India emergency services).
          </p>
          <div className="flex gap-3">
            <Button type="submit" className="w-auto! px-5" loading={report.isPending}>
              Send report
            </Button>
            <Button
              variant="link"
              onClick={() => {
                setReporting(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      {error && <Alert tone="error">{error}</Alert>}
    </section>
  );
}
