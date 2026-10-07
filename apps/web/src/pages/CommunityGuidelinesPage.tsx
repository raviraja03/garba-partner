import { Link } from 'react-router';
import { APP_NAME, COMMUNITY_GUIDELINES, GUIDELINES_VERSION } from '@garba-partner/shared';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/ui/Card';
import { TEXT_LINK } from '../components/ui/link-styles';

/** Public: the rules every member agrees to follow, and what happens when they are broken. */
export function CommunityGuidelinesPage() {
  return (
    <article className="space-y-6">
      <PageHeader
        title="Community guidelines"
        description={`${APP_NAME} is for adults (18+) looking for a Garba partner. These rules keep it safe and friendly for everyone. Updated ${GUIDELINES_VERSION}.`}
      />

      <ol className="space-y-3">
        {COMMUNITY_GUIDELINES.map((guideline, index) => (
          <Card as="li" key={guideline.id} id={guideline.id} className="flex gap-4">
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-small font-bold text-white"
            >
              {index + 1}
            </span>
            <div className="min-w-0">
              <h2 className="text-h3">
                <span className="sr-only">{index + 1}. </span>
                {guideline.title}
              </h2>
              <p className="mt-1">{guideline.summary}</p>
              {guideline.examples.length > 0 && (
                <>
                  <p className="mt-3 text-caption font-bold tracking-wide text-danger uppercase">
                    Not allowed
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-small">
                    {guideline.examples.map((example) => (
                      <li key={example}>{example}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </Card>
        ))}
      </ol>

      <section className="space-y-2 rounded-card bg-brand-50 p-5 ring-1 ring-brand-200">
        <h2 className="text-h3">What happens if someone breaks them</h2>
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
          <Link to="/safety" className={TEXT_LINK}>
            safety tips
          </Link>
          .
        </p>
      </section>
    </article>
  );
}
