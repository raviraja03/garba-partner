import type { ProfileStatus, UserStatus } from '@garba-partner/shared';

const ACCOUNT: Record<UserStatus, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-green-100 text-green-800' },
  suspended: { label: 'Suspended', className: 'bg-red-100 text-red-800' },
  banned: { label: 'Banned', className: 'bg-red-200 text-red-900' },
  pending_deletion: { label: 'Pending deletion', className: 'bg-black/10 text-muted' },
};

const PROFILE: Record<ProfileStatus, { label: string; className: string }> = {
  not_started: { label: 'No profile', className: 'bg-black/5 text-muted' },
  incomplete: { label: 'Incomplete', className: 'bg-brand-100 text-brand-900' },
  complete: { label: 'Complete', className: 'bg-green-100 text-green-800' },
};

function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}>
      {label}
    </span>
  );
}

export const AccountStatusBadge = ({ status }: { status: UserStatus }) => (
  <Badge {...ACCOUNT[status]} />
);
export const ProfileStatusBadge = ({ status }: { status: ProfileStatus }) => (
  <Badge {...PROFILE[status]} />
);
