import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../features/auth/auth-context';

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="space-y-2 rounded-card bg-white p-4 text-sm shadow-sm ring-1 ring-black/5"
    >
      <h2 id={`${id}-title`} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Public safety information: meeting safely, scams, blocking and reporting, emergencies. */
export function SafetyCenterPage() {
  const { state } = useAuth();
  const signedIn = state.status === 'authenticated';
  return (
    <article className="space-y-4">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Safety centre</h1>
        <p className="text-muted">
          Garba Partner helps you find someone to dance with. You are always in control of who you
          talk to and meet.
        </p>
      </header>

      <div
        role="alert"
        className="rounded-card bg-red-50 p-4 text-sm text-red-900 ring-1 ring-red-200"
      >
        <strong>In danger right now?</strong> Call{' '}
        <a href="tel:112" className="font-semibold underline">
          112
        </a>{' '}
        (emergency) or the Women Helpline{' '}
        <a href="tel:181" className="font-semibold underline">
          181
        </a>
        .
      </div>

      <Section id="meeting" title="Meeting your partner">
        <ul className="list-disc space-y-1 pl-5">
          <li>Meet at the event or another busy public place, never at home or a hotel.</li>
          <li>Tell a friend who you are meeting, where and when. Share your live location.</li>
          <li>Arrange your own travel both ways and keep your phone charged.</li>
          <li>
            Keep chatting on Garba Partner until you trust someone. You can block them any time.
          </li>
          <li>Trust your instincts: you can leave at any moment, no explanation needed.</li>
        </ul>
      </Section>

      <Section id="money" title="Scams and money requests">
        <p>
          <strong>Never send money</strong> to someone you met here, whatever the story: an
          emergency, a pass they can&apos;t afford, a taxi, an investment, a gift. Genuine partners
          don&apos;t ask.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Never share OTPs, UPI PINs, card numbers or bank details.</li>
          <li>Buy passes only through the official event link on the event page.</li>
          <li>Be careful with anyone who wants to move to another app straight away.</li>
          <li>
            Report anyone who asks for money: choose <em>Asking for money</em> when you report.
          </li>
        </ul>
        <p className="text-muted">
          We show a warning in chat when a message looks like a request for money, and our team
          reviews members who ask repeatedly.
        </p>
      </Section>

      <Section id="block-report" title="Blocking and reporting">
        <p>
          <strong>Block</strong> someone from their profile or your chat: they disappear for you,
          your chat ends, and they can&apos;t contact you. They are not told.
        </p>
        <p>
          <strong>Report</strong> a member or a single message if they break our{' '}
          <Link to="/guidelines" className="font-semibold text-brand-700 underline">
            community guidelines
          </Link>
          . Moderators review every report; the member is never told who reported them. Reporting
          also ends your chat with them.
        </p>
        {signedIn && (
          <p>
            <Link to="/profile/blocked" className="font-semibold text-brand-700 underline">
              Manage blocked members
            </Link>
          </p>
        )}
      </Section>

      <Section id="verification" title="About verification">
        <p>
          A verified badge means we checked something specific, such as a phone number or a selfie.
          It is <strong>not</strong> a guarantee of someone&apos;s identity, intentions or safety.
          Follow the same precautions with every member.
        </p>
      </Section>
    </article>
  );
}
