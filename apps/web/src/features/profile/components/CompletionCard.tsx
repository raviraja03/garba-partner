import type { ProfileCompletionDto } from '@garba-partner/shared';
import { COMPLETION_FIELD_LABELS, PROFILE_STATUS_LABELS } from '../../../lib/labels';

const STATUS_CLASS = {
  not_started: 'bg-black/5 text-muted',
  incomplete: 'bg-brand-100 text-brand-900',
  complete: 'bg-green-100 text-green-800',
} as const;

export function CompletionCard({ completion }: { completion: ProfileCompletionDto }) {
  const missing = [...completion.missingRequired, ...completion.missingOptional];
  return (
    <section
      className="rounded-card bg-white p-5 shadow-sm ring-1 ring-black/5"
      aria-labelledby="completion-title"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="completion-title" className="font-semibold">
          Profile {completion.percentage}% complete
        </h2>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_CLASS[completion.status]}`}
        >
          {PROFILE_STATUS_LABELS[completion.status]}
        </span>
      </div>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-brand-50"
        role="progressbar"
        aria-valuenow={completion.percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Profile completion"
      >
        <div
          className="h-full rounded-full bg-brand-600"
          style={{ width: `${String(completion.percentage)}%` }}
        />
      </div>
      {missing.length > 0 && (
        <p className="mt-3 text-sm text-muted">
          {completion.missingRequired.length > 0 ? (
            <>
              <strong className="text-ink">Required:</strong>{' '}
              {completion.missingRequired.map((f) => COMPLETION_FIELD_LABELS[f]).join(', ')}.{' '}
            </>
          ) : null}
          {completion.missingOptional.length > 0 ? (
            <>
              Add {completion.missingOptional.map((f) => COMPLETION_FIELD_LABELS[f]).join(', ')} to
              stand out.
            </>
          ) : null}
        </p>
      )}
    </section>
  );
}
