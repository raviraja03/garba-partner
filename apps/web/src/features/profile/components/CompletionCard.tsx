import type { ProfileCompletionDto } from '@garba-partner/shared';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { COMPLETION_FIELD_LABELS, PROFILE_STATUS_LABELS } from '../../../lib/labels';

const STATUS_TONE = { not_started: 'neutral', incomplete: 'yellow', complete: 'success' } as const;

export function CompletionCard({ completion }: { completion: ProfileCompletionDto }) {
  const missing = [...completion.missingRequired, ...completion.missingOptional];
  return (
    <Card as="section" aria-labelledby="completion-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="completion-title" className="text-h3">
          Profile {completion.percentage}% complete
        </h2>
        <Badge
          tone={STATUS_TONE[completion.status]}
          {...(completion.status === 'complete' ? { icon: 'check' as const } : {})}
        >
          {PROFILE_STATUS_LABELS[completion.status]}
        </Badge>
      </div>
      <div
        className="mt-3 h-2.5 overflow-hidden rounded-full bg-brand-100"
        role="progressbar"
        aria-valuenow={completion.percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Profile completion"
      >
        <div
          className="h-full rounded-full bg-accent-500 transition-[width] duration-500 ease-soft"
          style={{ width: `${String(completion.percentage)}%` }}
        />
      </div>
      {missing.length > 0 && (
        <p className="mt-3 text-small text-muted">
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
    </Card>
  );
}
