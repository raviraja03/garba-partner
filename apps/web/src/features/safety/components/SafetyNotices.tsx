import { Link } from 'react-router';
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
        <div
          role="alert"
          className="rounded-card bg-red-50 p-4 text-sm text-red-900 ring-1 ring-red-200"
        >
          <p className="font-semibold">Your account is suspended</p>
          <p className="mt-1">
            {suspendedUntil
              ? `You can use Garba Partner again after ${date(suspendedUntil)}.`
              : 'Our team is reviewing your account.'}{' '}
            You can still block and report members. Please read our{' '}
            <Link to="/guidelines" className="font-semibold underline">
              community guidelines
            </Link>
            .
          </p>
        </div>
      )}
      {chatRestricted && (
        <div
          role="status"
          className="rounded-card bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200"
        >
          <p className="font-semibold">You can&apos;t send messages right now</p>
          <p className="mt-1">
            A moderator restricted messaging on your account
            {chatRestrictedUntil ? ` until ${date(chatRestrictedUntil)}` : ''}. You can still read
            your chats. See our{' '}
            <Link to="/guidelines" className="font-semibold underline">
              community guidelines
            </Link>
            .
          </p>
        </div>
      )}
      {warnings.map((warning) => (
        <div
          key={warning.id}
          role="alert"
          className="rounded-card bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200"
        >
          <p className="font-semibold">
            Warning from our moderators
            {warning.guideline ? `: ${warning.guideline.title}` : ''}
          </p>
          <p className="mt-1">
            {warning.guideline?.summary ??
              'Something you did on Garba Partner went against our community guidelines.'}{' '}
            Further violations can lead to your account being suspended or banned.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <Button
              className="w-auto! px-4"
              loading={acknowledge.isPending && acknowledge.variables === warning.id}
              onClick={() => {
                acknowledge.mutate(warning.id);
              }}
            >
              I understand
            </Button>
            <Link to="/guidelines" className="font-semibold underline">
              Read the guidelines
            </Link>
          </div>
        </div>
      ))}
    </section>
  );
}
