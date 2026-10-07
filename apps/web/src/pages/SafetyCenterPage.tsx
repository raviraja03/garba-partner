import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/ui/Card';
import { Icon, type IconName } from '../components/ui/Icon';
import { useAuth } from '../features/auth/auth-context';
import { TEXT_LINK } from '../components/ui/link-styles';

const HELPLINE_CLASS =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-danger px-4 text-button font-bold text-white';

const TOPICS = [
  { id: 'meeting', label: 'Meeting safely' },
  { id: 'money', label: 'Scams and money' },
  { id: 'block-report', label: 'Block and report' },
  { id: 'verification', label: 'Verification' },
] as const;

function Section({
  id,
  icon,
  title,
  children,
}: {
  id: string;
  icon: IconName;
  title: string;
  children: ReactNode;
}) {
  return (
    <Card as="section" id={id} aria-labelledby={`${id}-title`} className="space-y-3">
      <h2 id={`${id}-title`} className="flex items-center gap-3 text-h3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <Icon name={icon} />
        </span>
        {title}
      </h2>
      {children}
    </Card>
  );
}

/** Public safety information: meeting safely, scams, blocking and reporting, emergencies. */
export function SafetyCenterPage() {
  const { state } = useAuth();
  const signedIn = state.status === 'authenticated';
  return (
    <article className="space-y-5">
      <PageHeader
        title="Safety centre"
        description="GarbaMates helps you find someone to dance with. You are always in control of who you talk to and meet."
      />

      <div
        role="alert"
        className="rounded-card bg-danger-soft p-5 text-danger ring-1 ring-danger/20"
      >
        <p className="flex items-center gap-2 text-h3">
          <Icon name="alert" />
          In danger right now?
        </p>
        <p className="mt-1 text-small">Call for help first. You can report to us afterwards.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <a href="tel:112" className={HELPLINE_CLASS}>
            Call 112 · Emergency
          </a>
          <a href="tel:181" className={HELPLINE_CLASS}>
            Call 181 · Women Helpline
          </a>
        </div>
      </div>

      <nav aria-label="On this page" className="flex flex-wrap gap-2">
        {TOPICS.map((topic) => (
          <a
            key={topic.id}
            href={`#${topic.id}`}
            className="inline-flex min-h-11 items-center rounded-full bg-card px-4 text-small font-semibold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50"
          >
            {topic.label}
          </a>
        ))}
      </nav>

      <Section id="meeting" icon="users" title="Meeting your partner">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Meet at the event or another busy public place, never at home or a hotel.</li>
          <li>Tell a friend who you are meeting, where and when. Share your live location.</li>
          <li>Arrange your own travel both ways and keep your phone charged.</li>
          <li>Keep chatting on GarbaMates until you trust someone. You can block them any time.</li>
          <li>Trust your instincts: you can leave at any moment, no explanation needed.</li>
        </ul>
      </Section>

      <Section id="money" icon="alert" title="Scams and money requests">
        <p>
          <strong>Never send money</strong> to someone you met here, whatever the story: an
          emergency, a pass they can&apos;t afford, a taxi, an investment, a gift. Genuine partners
          don&apos;t ask.
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Never share OTPs, UPI PINs, card numbers or bank details.</li>
          <li>Buy passes only through the official event link on the event page.</li>
          <li>Be careful with anyone who wants to move to another app straight away.</li>
          <li>
            Report anyone who asks for money: choose <em>Asking for money</em> when you report.
          </li>
        </ul>
        <p className="text-small text-muted">
          We show a warning in chat when a message looks like a request for money, and our team
          reviews members who ask repeatedly.
        </p>
      </Section>

      <Section id="block-report" icon="shield" title="Blocking and reporting">
        <p>
          <strong>Block</strong> someone from their profile or your chat: they disappear for you,
          your chat ends, and they can&apos;t contact you. They are not told.
        </p>
        <p>
          <strong>Report</strong> a member or a single message if they break our{' '}
          <Link to="/guidelines" className={TEXT_LINK}>
            community guidelines
          </Link>
          . Moderators review every report; the member is never told who reported them. Reporting
          also ends your chat with them.
        </p>
        {signedIn && (
          <p>
            <Link to="/profile/blocked" className={TEXT_LINK}>
              Manage blocked members
            </Link>
          </p>
        )}
      </Section>

      <Section id="verification" icon="check" title="About verification">
        <p>
          A verified badge means we checked something specific, such as a phone number or a selfie.
          It is <strong>not</strong> a guarantee of someone&apos;s identity, intentions or safety.
          Follow the same precautions with every member.
        </p>
      </Section>
    </article>
  );
}
