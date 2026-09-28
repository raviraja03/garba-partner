import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { LIMITS, type AdminUserDetailDto } from '@garba-partner/shared';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { FullPageSpinner } from '../components/FullPageSpinner';
import { useAdminAuth } from '../features/auth/auth-context';
import { useUser, useUserStatusAction } from '../features/users/hooks';
import { AccountStatusBadge, ProfileStatusBadge } from '../features/users/StatusBadge';

function formatDateTime(iso: string | null) {
  return iso
    ? new Intl.DateTimeFormat('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Kolkata',
      }).format(new Date(iso))
    : '—';
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-card bg-white p-5 shadow-sm ring-1 ring-black/5">
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function StatusAction({ user }: { user: AdminUserDetailDto }) {
  const action = user.accountStatus === 'suspended' ? 'reactivate' : 'suspend';
  const mutation = useUserStatusAction(user.id, action);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (user.accountStatus !== 'active' && user.accountStatus !== 'suspended') return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reason.trim().length < LIMITS.ADMIN_ACTION_REASON_MIN) {
      setError(
        `Please give a reason of at least ${String(LIMITS.ADMIN_ACTION_REASON_MIN)} characters.`,
      );
      return;
    }
    try {
      await mutation.mutateAsync(reason.trim());
      setOpen(false);
      setReason('');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
    }
  }

  const label = action === 'suspend' ? 'Suspend user' : 'Reactivate user';
  if (!open) {
    return (
      <Button
        variant={action === 'suspend' ? 'primary' : 'secondary'}
        className={`w-auto! px-5 ${action === 'suspend' ? 'bg-danger! hover:bg-red-700!' : ''}`}
        onClick={() => {
          setOpen(true);
        }}
      >
        {label}
      </Button>
    );
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="space-y-3 rounded-xl bg-red-50 p-4"
    >
      <label htmlFor="action-reason" className="block text-sm font-semibold">
        Reason (recorded in the audit log)
      </label>
      <textarea
        id="action-reason"
        rows={3}
        maxLength={LIMITS.ADMIN_ACTION_REASON_MAX}
        value={reason}
        onChange={(event) => {
          setReason(event.target.value);
        }}
        className="w-full rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-black/10"
      />
      {action === 'suspend' && (
        <p className="text-xs text-muted">
          Suspending signs the member out everywhere immediately. They can still log in to see their
          status and edit their profile.
        </p>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex gap-3">
        <Button type="submit" className="w-auto! px-5" loading={mutation.isPending}>
          Confirm
        </Button>
        <Button
          variant="link"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function UserDetailPage() {
  const { userId = '' } = useParams();
  const { state } = useAdminAuth();
  const user = useUser(userId);

  if (user.isPending) return <FullPageSpinner />;
  if (user.isError) return <Alert tone="error">{user.error.message}</Alert>;

  const data = user.data;
  const { profile, preferences } = data;
  const canSanction =
    state.status === 'authenticated' && state.admin.permissions.includes('users:sanction');

  return (
    <div className="max-w-4xl space-y-5">
      <Link to="/users" className="text-sm font-semibold text-brand-700 hover:underline">
        ← All users
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {profile?.image ? (
            <img
              src={profile.image.thumbnailUrl}
              alt=""
              className="size-16 rounded-full object-cover"
            />
          ) : (
            <span className="size-16 rounded-full bg-black/5" aria-hidden="true" />
          )}
          <div>
            <h1 className="text-2xl font-extrabold">{profile?.name ?? 'No profile yet'}</h1>
            <p className="mt-1 flex gap-2">
              <AccountStatusBadge status={data.accountStatus} />
              <ProfileStatusBadge status={data.profileStatus} />
              <span className="text-xs text-muted">{data.completion.percentage}% complete</span>
            </p>
            <p className="mt-1 font-mono text-xs text-muted">{data.id}</p>
          </div>
        </div>
        {canSanction && <StatusAction user={data} />}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Section title="Profile">
          {profile ? (
            <Rows
              rows={[
                ['Name', profile.name],
                ['Age', `${String(profile.age)} (born ${profile.dateOfBirth})`],
                ['Gender', profile.gender.replace('_', '-')],
                ['City', `${profile.city.name}${profile.area ? ` · ${profile.area.name}` : ''}`],
                ['Garba level', profile.garbaLevel],
                ['Bio', profile.bio ?? '—'],
                ['Instagram (private)', profile.instagramId ? `@${profile.instagramId}` : '—'],
                ['Available dates', profile.availableDates.join(', ') || '—'],
                ['Updated', formatDateTime(profile.updatedAt)],
              ]}
            />
          ) : (
            <p className="text-sm text-muted">This member has not created a profile.</p>
          )}
        </Section>

        <Section title="Account">
          <Rows
            rows={[
              ['Joined', formatDateTime(data.createdAt)],
              ['Last active', formatDateTime(data.lastActiveAt)],
              ['Onboarded', formatDateTime(data.onboardingCompletedAt)],
              ['Photo verified', data.photoVerified ? 'Yes' : 'No'],
              ['Hidden from discovery', data.hiddenFromDiscovery ? 'Yes' : 'No'],
              ['Terms version', data.termsVersion ?? '—'],
              ['Active sessions', String(data.activeSessionCount)],
              ['Deletion requested', formatDateTime(data.deletionRequestedAt)],
            ]}
          />
        </Section>

        <Section title="Preferences">
          {preferences ? (
            <Rows
              rows={[
                ['Dance with', preferences.preferredGender],
                ['Ages', `${String(preferences.minAge)}–${String(preferences.maxAge)}`],
                ['Verified only', preferences.verifiedOnly ? 'Yes' : 'No'],
                ['In discovery', preferences.discoveryEnabled ? 'Yes' : 'Paused'],
                ['Shows area', preferences.showArea ? 'Yes' : 'No'],
              ]}
            />
          ) : (
            <p className="text-sm text-muted">—</p>
          )}
        </Section>

        <Section title="Verifications">
          {data.verifications.length === 0 ? (
            <p className="text-sm text-muted">None.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {data.verifications.map((v) => (
                <li key={v.createdAt}>
                  {v.type} · <strong>{v.status}</strong> · {formatDateTime(v.createdAt)}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <p className="text-xs text-muted">
        The member&apos;s mobile number is never shown here. Revealing it is a separate,
        super-admin-only, audited action (not yet available).
      </p>
    </div>
  );
}
