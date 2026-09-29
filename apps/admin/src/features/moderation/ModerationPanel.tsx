import type { AdminUserDetailDto } from '@garba-partner/shared';
import { ReasonAction } from '../users/ReasonAction';
import { useLiftSanction, useSanctionUser } from './hooks';
import { SanctionForm } from './SanctionForm';
import { SanctionHistory } from './SanctionHistory';

/**
 * Moderator actions on a member (docs/safety/admin-actions.md), from least to most severe.
 * Everything is audited; lifting a ban needs `users:unban` (super admin).
 */
export function ModerationPanel({
  user,
  canSanction,
  canUnban,
}: {
  user: AdminUserDetailDto;
  canSanction: boolean;
  canUnban: boolean;
}) {
  const sanction = useSanctionUser(user.id);
  const lift = useLiftSanction(user.id);
  const banned = user.accountStatus === 'banned';
  const actionable = user.accountStatus === 'active' || user.accountStatus === 'suspended';

  return (
    <section className="space-y-4 rounded-card bg-white p-5 shadow-sm ring-1 ring-black/5">
      <div>
        <h2 className="font-semibold">Moderation</h2>
        <p className="text-xs text-muted">
          Chat restricted: {user.chatRestricted ? 'yes' : 'no'} · Hidden from discovery:{' '}
          {user.hiddenFromDiscovery ? 'yes' : 'no'} · Open reports: {user.openReportCount}
        </p>
      </div>

      {canSanction && actionable && (
        <div className="flex flex-wrap items-start gap-3">
          <SanctionForm
            label="Warn"
            hint="The member sees an in-app warning citing the guideline and must acknowledge it."
            onSubmit={(body) => sanction.mutateAsync({ path: 'warn', body })}
          />
          {user.chatRestricted ? (
            <ReasonAction
              label="Lift chat restriction"
              onConfirm={(reason) => lift.mutateAsync({ path: 'lift-chat-restriction', reason })}
            />
          ) : (
            <SanctionForm
              label="Restrict chat"
              hint="The member can read their chats but can't send messages. Their matches stay open."
              withDuration
              onSubmit={(body) => sanction.mutateAsync({ path: 'restrict-chat', body })}
            />
          )}
          {user.accountStatus === 'suspended' ? (
            <ReasonAction
              label="Reactivate"
              onConfirm={(reason) => lift.mutateAsync({ path: 'reactivate', reason })}
            />
          ) : (
            <SanctionForm
              label="Suspend"
              hint="Signs the member out everywhere now and hides them. They can still log in to see why, block and report."
              withDuration
              danger
              onSubmit={(body) => sanction.mutateAsync({ path: 'suspend', body })}
            />
          )}
          <SanctionForm
            label="Ban"
            hint="Permanent. Signs the member out, ends all their matches and cancels pending interests. Only a super admin can lift it."
            danger
            confirmText="Ban this member permanently? Only a super admin can undo this."
            onSubmit={(body) => sanction.mutateAsync({ path: 'ban', body })}
          />
        </div>
      )}
      {banned && canUnban && (
        <ReasonAction
          label="Lift ban"
          hint="Restores access. Ended matches and chats stay ended."
          onConfirm={(reason) => lift.mutateAsync({ path: 'unban', reason })}
        />
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold">Sanction history</h3>
        <SanctionHistory sanctions={user.sanctions} />
      </div>
    </section>
  );
}
