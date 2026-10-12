import { useEffect } from 'react';
import { Link } from 'react-router';
import { APP_NAME } from '@garba-partner/shared';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { TEXT_LINK } from '../../components/ui/link-styles';
import { LAST_UPDATED, OPERATOR, type LegalDocument } from './content';

const RELATED = [
  { to: '/privacy-policy', label: 'Privacy Policy' },
  { to: '/terms', label: 'Terms and Conditions' },
  { to: '/guidelines', label: 'Community Guidelines' },
  { to: '/safety', label: 'Safety centre' },
] as const;

/** Who to contact. Says so plainly while the operator's details are still to be filled in. */
function Contact() {
  return (
    <section id="contact" className="scroll-mt-24">
      <h2 className="text-h2">Contact us</h2>
      {OPERATOR.email ? (
        <div className="mt-2 space-y-2">
          <p>
            {APP_NAME} is operated by {OPERATOR.legalName ?? APP_NAME}
            {OPERATOR.address ? `, ${OPERATOR.address}` : ''}.
          </p>
          <p>
            For privacy requests, complaints or legal notices, write to{' '}
            <a href={`mailto:${OPERATOR.email}`} className={TEXT_LINK}>
              {OPERATOR.email}
            </a>
            .
          </p>
          {OPERATOR.grievanceOfficer && <p>Grievance officer: {OPERATOR.grievanceOfficer}.</p>}
        </div>
      ) : (
        <p className="mt-2">
          Contact details for privacy requests and complaints will be published here before launch.
        </p>
      )}
    </section>
  );
}

/**
 * A legal document (privacy policy, terms): title, date, a list of sections to jump to, then
 * the text. The wording comes from `content.ts`.
 */
export function LegalPage({ document: doc, path }: { document: LegalDocument; path: string }) {
  // The browser tab and bookmarks should name the document, not the site tagline.
  useEffect(() => {
    const previous = document.title;
    document.title = `${doc.title} — ${APP_NAME}`;
    return () => {
      document.title = previous;
    };
  }, [doc.title]);

  return (
    <article className="space-y-6">
      <PageHeader title={doc.title} description={`Last updated: ${LAST_UPDATED}`} />
      <p>{doc.intro}</p>

      <nav aria-label="On this page" className="rounded-card bg-brand-50 p-4 ring-1 ring-brand-100">
        <h2 className="text-label text-muted">On this page</h2>
        <ol className="mt-1 grid gap-x-6 sm:grid-cols-2">
          {[...doc.sections, { id: 'contact', heading: 'Contact us' }].map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="inline-flex min-h-11 items-center text-small font-semibold text-brand-700 underline-offset-4 hover:underline"
              >
                {section.heading}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <Card className="space-y-8">
        {doc.sections.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-24">
            <h2 className="text-h2">{section.heading}</h2>
            <div className="mt-2 space-y-3">
              {section.blocks.map((block) =>
                typeof block === 'string' ? (
                  <p key={block}>{block}</p>
                ) : (
                  <ul key={block[0]} className="list-disc space-y-1.5 pl-5">
                    {block.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ),
              )}
            </div>
          </section>
        ))}
        <Contact />
      </Card>

      <nav aria-label="Related pages" className="flex flex-wrap gap-x-5">
        {RELATED.filter((link) => link.to !== path).map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className={`inline-flex min-h-11 items-center text-small ${TEXT_LINK}`}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </article>
  );
}
