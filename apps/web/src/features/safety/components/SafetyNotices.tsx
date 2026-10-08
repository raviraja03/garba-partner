import { Link } from 'react-router';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { useAcknowledgeWarning, useMySafety } from '../hooks';

const date = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));

const NOTICE_LINK = 'font-semibold underline underline-offset-2 hover:no-underline';

/**
 * Moderation notices on the member's own account, shown above every page: warnings (with the
 * guideline they cite, to acknowledge), a chat restriction or a suspension. It never says who
 * reported them or includes moderator notes (the API doesn't return them).
 */
export function SafetyNotices({ enabled }: { enabled: boolean }) {
  const safety = useMySafety(enabled);
  const acknowledge = useAcknowledgeWarning();
  if (!safety.data) return null;
  const { warnings, chatRestricted, chatRestrictedUntil, accountStatus, suspendedUntil } =
    safety.data;
  if (warnings.length === 0 && !chatRestricted && accountStatus !== 'suspended') return null;

  return (
    <section aria-label="Account notices" className="mt-4 space-y-3">
      {accountStatus === 'suspended' && (
        <Alert tone="error" title="Your account is suspended">
          <p className="mt-1">
            {suspendedUntil
              ? `You can use GarbaMates again after ${date(suspendedUntil)}.`
              : 'Our team is reviewing your account.'}{' '}
            You can still block and report members. Please read our{' '}
            <Link to="/guidelines" className={NOTICE_LINK}>
              community guidelines
            </Link>
            .
          </p>
        </Alert>
      )}
      {chatRestricted && (
        <Alert tone="warning" title="You can't send messages right now">
          <p className="mt-1">
            A moderator restricted messaging on your account
            {chatRestrictedUntil ? ` until ${date(chatRestrictedUntil)}` : ''}. You can still read
            your chats. See our{' '}
            <Link to="/guidelines" className={NOTICE_LINK}>
              community guidelines
            </Link>
            .
          </p>
        </Alert>
      )}
      {warnings.map((warning) => (
        <div
          key={warning.id}
          role="alert"
          className="rounded-control bg-accent-yellow-soft px-4 py-3 text-small text-primary ring-1 ring-accent-yellow/60"
        >
          <p className="font-semibold">
            Warning from our moderators
            {warning.guideline ? `: ${warning.guideline.title}` : ''}
          </p>
          <p className="mt-1">
            {warning.guideline?.summary ??
              'Something you did on GarbaMates went against our community guidelines.'}{' '}
            Further violations can lead to your account being suspended or banned.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button
              size="sm"
              fullWidth={false}
              loading={acknowledge.isPending && acknowledge.variables === warning.id}
              onClick={() => {
                acknowledge.mutate(warning.id);
              }}
            >
              I understand
            </Button>
            <Link to="/guidelines" className={`inline-flex min-h-11 items-center ${NOTICE_LINK}`}>
              Read the guidelines
            </Link>
          </div>
        </div>
      ))}
    </section>
  );
}
