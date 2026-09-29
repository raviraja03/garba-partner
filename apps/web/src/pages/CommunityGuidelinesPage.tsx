import { Link } from 'react-router';
import { APP_NAME, COMMUNITY_GUIDELINES, GUIDELINES_VERSION } from '@garba-partner/shared';

/** Public: the rules every member agrees to follow, and what happens when they are broken. */
export function CommunityGuidelinesPage() {
  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Community guidelines</h1>
        <p className="text-muted">
          {APP_NAME} is for adults (18+) looking for a Garba partner. These rules keep it safe and
          friendly for everyone. Updated {GUIDELINES_VERSION}.
        </p>
      </header>

      <ol className="space-y-4">
        {COMMUNITY_GUIDELINES.map((guideline, index) => (
          <li
            key={guideline.id}
            id={guideline.id}
            className="rounded-card bg-white p-4 shadow-sm ring-1 ring-black/5"
          >
            <h2 className="font-semibold">
              {index + 1}. {guideline.title}
            </h2>
            <p className="mt-1 text-sm">{guideline.summary}</p>
            {guideline.examples.length > 0 && (
              <>
                <p className="mt-2 text-xs font-semibold text-muted uppercase">Not allowed</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
                  {guideline.examples.map((example) => (
                    <li key={example}>{example}</li>
                  ))}
                </ul>
              </>
            )}
          </li>
        ))}
      </ol>

      <section className="space-y-2 text-sm">
        <h2 className="text-lg font-semibold">What happens if someone breaks them</h2>
        <p>
          Reports are reviewed by our moderators. Depending on what happened, a moderator can
          dismiss the report, send a <strong>warning</strong>, <strong>restrict messaging</strong>,{' '}
          <strong>suspend</strong> the account for a while, or <strong>ban</strong> it permanently.
          A report alone never bans anyone automatically: a person always reviews it first. We never
          tell a member who reported them.
        </p>
        <p>
          Verification badges confirm specific checks only (like a phone number or a selfie). They
          do not guarantee who someone is or that they are safe, so always follow our{' '}
          <Link to="/safety" className="font-semibold text-brand-700 underline">
            safety tips
          </Link>
          .
        </p>
      </section>
    </article>
  );
}
