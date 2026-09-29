import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import {
  LIMITS,
  REPORT_RESOLUTION_ACTIONS,
  type AdminMessageDto,
  type ReportResolutionAction,
} from '@garba-partner/shared';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { FullPageSpinner } from '../components/FullPageSpinner';
import { useOpenConversation, useReport, useResolveReport } from '../features/reports/hooks';
import {
  ACTION_LABELS,
  PRIORITY_LABELS,
  REASON_LABELS,
  STATUS_LABELS,
} from '../features/reports/labels';
import { formatDateTime } from '../lib/format';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-card bg-white p-5 shadow-sm ring-1 ring-black/5">
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-3 space-y-2 text-sm">{children}</div>
    </section>
  );
}

/** Messages as moderators see them: role labels, never phone numbers; plain text only. */
function MessageList({ messages }: { messages: AdminMessageDto[] }) {
  if (messages.length === 0) return <p className="text-muted">No messages.</p>;
  return (
    <ol className="space-y-2">
      {messages.map((m) => (
        <li
          key={m.id}
          className={`rounded-xl px-3 py-2 ${m.reported ? 'bg-red-50 ring-2 ring-red-300' : 'bg-black/5'}`}
        >
          <p className="text-xs text-muted">
            <strong className={m.senderRole === 'reported' ? 'text-red-800' : 'text-ink'}>
              {m.senderRole === 'reported' ? 'Reported member' : 'Reporter'}
            </strong>{' '}
            · {formatDateTime(m.createdAt)}
            {m.reported && ' · REPORTED MESSAGE'}
            {m.containsContactInfo && ' · contact details detected'}
          </p>
          <p className="whitespace-pre-wrap break-words">{m.body}</p>
        </li>
      ))}
    </ol>
  );
}

function ResolveForm({ reportId, hidden }: { reportId: string; hidden: boolean }) {
  const resolve = useResolveReport(reportId);
  const [action, setAction] = useState<ReportResolutionAction>('warn');
  const [note, setNote] = useState('');
  const [clearAutoHide, setClearAutoHide] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (note.trim().length < LIMITS.ADMIN_RESOLUTION_NOTE_MIN) {
      setError(`Write a note of at least ${String(LIMITS.ADMIN_RESOLUTION_NOTE_MIN)} characters.`);
      return;
    }
    if (
      (action === 'suspend' || action === 'ban') &&
      !window.confirm(`${ACTION_LABELS[action]}? The member is signed out everywhere immediately.`)
    ) {
      return;
    }
    setError(null);
    try {
      await resolve.mutateAsync({
        action,
        note: note.trim(),
        ...(clearAutoHide ? { clearAutoHide: true } : {}),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resolve.');
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
      <fieldset className="space-y-1">
        <legend className="font-semibold">Outcome</legend>
        {REPORT_RESOLUTION_ACTIONS.map((value) => (
          <label key={value} className="flex items-center gap-2">
            <input
              type="radio"
              name="resolution"
              checked={action === value}
              onChange={() => {
                setAction(value);
              }}
            />
            {ACTION_LABELS[value]}
          </label>
        ))}
      </fieldset>
      <label htmlFor="resolution-note" className="block font-semibold">
        Note (recorded in the audit log)
      </label>
      <textarea
        id="resolution-note"
        rows={3}
        maxLength={LIMITS.ADMIN_RESOLUTION_NOTE_MAX}
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
        }}
        className="w-full rounded-xl bg-white px-3 py-2 ring-1 ring-black/10"
      />
      {hidden && (action === 'dismiss' || action === 'warn') && (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={clearAutoHide}
            onChange={(e) => {
              setClearAutoHide(e.target.checked);
            }}
          />
          Show the member in discovery again (remove the automatic hide)
        </label>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" className="w-auto! px-6" loading={resolve.isPending}>
        Resolve report
      </Button>
    </form>
  );
}

/** One report: evidence snapshot, audited conversation access (open chat reports), resolution. */
export function ReportDetailPage() {
  const { reportId = '' } = useParams();
  const report = useReport(reportId);
  const conversation = useOpenConversation(reportId);

  if (report.isPending) return <FullPageSpinner />;
  if (report.isError) return <Alert tone="error">{report.error.message}</Alert>;
  const r = report.data;
  const open = r.status === 'open' || r.status === 'in_review';

  return (
    <div className="max-w-4xl space-y-5">
      <Link to="/reports" className="text-sm font-semibold text-brand-700 hover:underline">
        ← All reports
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold">
          {REASON_LABELS[r.reason]} · {PRIORITY_LABELS[r.priority]}
        </h1>
        <p className="text-sm text-muted">
          {STATUS_LABELS[r.status]} · received {formatDateTime(r.createdAt)} ·{' '}
          <Link to={`/users/${r.reportedUser.id}`} className="font-semibold hover:underline">
            {r.reportedUser.name ?? 'Reported member'}
          </Link>{' '}
          ({r.reportedUser.accountStatus}
          {r.reportedUserHiddenFromDiscovery ? ', hidden from discovery' : ''})
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Section title="Reporter's details">
          <p className="whitespace-pre-wrap">{r.details ?? '—'}</p>
          <p className="text-xs text-muted">The reported member is never told who reported them.</p>
        </Section>
        <Section title="Profile at report time">
          {r.evidence.profile ? (
            <div className="flex gap-3">
              {r.evidence.profile.imageUrl && (
                <img
                  src={r.evidence.profile.imageUrl}
                  alt=""
                  className="size-16 rounded-lg object-cover"
                />
              )}
              <div>
                <p className="font-semibold">{r.evidence.profile.name}</p>
                <p className="whitespace-pre-wrap text-muted">{r.evidence.profile.bio ?? ''}</p>
              </div>
            </div>
          ) : (
            <p className="text-muted">No profile.</p>
          )}
        </Section>
      </div>

      {r.involvesChat && (
        <Section title="Messages at report time (evidence snapshot)">
          <MessageList messages={r.evidence.messages} />
        </Section>
      )}

      {r.conversationAvailable && (
        <Section title="Conversation">
          {conversation.data ? (
            <MessageList messages={conversation.data.messages} />
          ) : (
            <>
              <p className="text-muted">
                Open the conversation only if the snapshot isn&apos;t enough to decide. Access is
                limited to {LIMITS.ADMIN_CONVERSATION_WINDOW} messages each side of the reported
                message and is recorded in the audit log under your name.
              </p>
              <Button
                variant="secondary"
                className="w-auto! px-4 py-2!"
                loading={conversation.isPending}
                onClick={() => {
                  conversation.mutate();
                }}
              >
                Open conversation (logged)
              </Button>
              {conversation.isError && <Alert tone="error">{conversation.error.message}</Alert>}
            </>
          )}
        </Section>
      )}

      {r.otherReports.length > 0 && (
        <Section title="Other reports about this member">
          <ul className="space-y-1">
            {r.otherReports.map((o) => (
              <li key={o.id}>
                <Link to={`/reports/${o.id}`} className="hover:underline">
                  {REASON_LABELS[o.reason]}
                </Link>{' '}
                · {STATUS_LABELS[o.status]} · {formatDateTime(o.createdAt)}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Resolution">
        {r.resolution ? (
          <p>
            <strong>{ACTION_LABELS[r.resolution.action]}</strong> on{' '}
            {formatDateTime(r.resolution.resolvedAt)}: {r.resolution.note}
          </p>
        ) : open ? (
          <ResolveForm reportId={r.id} hidden={r.reportedUserHiddenFromDiscovery} />
        ) : null}
      </Section>
    </div>
  );
}
