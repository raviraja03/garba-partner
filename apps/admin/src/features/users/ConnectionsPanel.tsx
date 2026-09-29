import { Link } from 'react-router';
import type { AdminUserDetailDto, MatchStatus } from '@garba-partner/shared';
import { Alert } from '../../components/ui/Alert';
import { useCloseMatch, useInteractionRestriction, useUserMatches } from './hooks';
import { ReasonAction } from './ReasonAction';

const MATCH_STATUS: Record<MatchStatus, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-green-100 text-green-800' },
  unmatched: { label: 'Unmatched', className: 'bg-black/5 text-muted' },
  blocked: { label: 'Ended by block', className: 'bg-red-100 text-red-800' },
  closed: { label: 'Closed', className: 'bg-red-100 text-red-800' },
};

function formatDate(iso: string | null) {
  return iso
    ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(
        new Date(iso),
      )
    : '—';
}

/**
 * Match moderation visibility: counts and match history (names, dates and statuses only; there
 * is no message content), plus the safety actions for users with `users:sanction`.
 */
export function ConnectionsPanel({
  user,
  canSanction,
}: {
  user: AdminUserDetailDto;
  canSanction: boolean;
}) {
  const matches = useUserMatches(user.id);
  const closeMatch = useCloseMatch(user.id);
  const restriction = useInteractionRestriction(user.id, !user.interactionsRestricted);
  const { connections } = user;

  return (
    <section className="space-y-4 rounded-card bg-white p-5 shadow-sm ring-1 ring-black/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Interests &amp; matches</h2>
          <p className="text-xs text-muted">
            {connections.activeMatches} active matches · {connections.pendingInterestsSent} pending
            sent · {connections.pendingInterestsReceived} pending received ·{' '}
            {connections.interestsSentLast24h} sent in the last 24 h
          </p>
        </div>
        <div className="flex items-center gap-2">
          {user.interactionsRestricted && (
            <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">
              Interactions restricted
            </span>
          )}
          {canSanction && (
            <ReasonAction
              label={user.interactionsRestricted ? 'Lift restriction' : 'Restrict interactions'}
              danger={!user.interactionsRestricted}
              hint={
                user.interactionsRestricted
                  ? 'The member will be able to send and accept interests again.'
                  : 'The member can still browse, but cannot send or accept interests. Their pending interests are cancelled. Existing matches stay unless you close them.'
              }
              onConfirm={(reason) => restriction.mutateAsync(reason)}
            />
          )}
        </div>
      </div>

      {matches.isError && <Alert tone="error">{matches.error.message}</Alert>}
      {matches.data?.length === 0 && <p className="text-sm text-muted">No matches.</p>}
      {matches.data && matches.data.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted uppercase">
            <tr>
              <th scope="col" className="py-2">
                Partner
              </th>
              <th scope="col" className="py-2">
                Status
              </th>
              <th scope="col" className="py-2">
                Matched
              </th>
              <th scope="col" className="py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {matches.data.map((match) => (
              <tr key={match.id} className="border-t border-black/5 align-top">
                <td className="py-2">
                  <Link to={`/users/${match.partner.id}`} className="font-semibold hover:underline">
                    {match.partner.name ?? 'No profile'}
                  </Link>
                  {match.eventName && (
                    <span className="block text-xs text-muted">for {match.eventName}</span>
                  )}
                </td>
                <td className="py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${MATCH_STATUS[match.status].className}`}
                  >
                    {MATCH_STATUS[match.status].label}
                  </span>
                  {match.endedAt && (
                    <span className="block text-xs text-muted">{formatDate(match.endedAt)}</span>
                  )}
                </td>
                <td className="py-2">{formatDate(match.createdAt)}</td>
                <td className="py-2 text-right">
                  {canSanction && match.status === 'active' && (
                    <ReasonAction
                      compact
                      danger
                      label="Close match"
                      confirmLabel="Close match"
                      hint="Both members lose the match immediately. Neither is told why."
                      onConfirm={(reason) => closeMatch.mutateAsync({ matchId: match.id, reason })}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
