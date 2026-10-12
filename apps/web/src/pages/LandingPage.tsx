import { Link } from 'react-router';
import { APP_NAME, APP_TAGLINE } from '@garba-partner/shared';
import { Logo } from '../components/Logo';
import { LinkButton } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Icon } from '../components/ui/Icon';
import { TEXT_LINK } from '../components/ui/link-styles';
import { PhotoPanel, Reveal, Section, Sparkle, Tile } from '../features/landing/components';
import {
  COMMUNITY,
  FINAL_CTA,
  FIND,
  HERO,
  HOW_IT_WORKS,
  JOURNEY,
  PARTNER,
  TRUST,
  VISION,
  type Tint,
} from '../features/landing/content';

const TINTS: Tint[] = ['pink', 'purple', 'orange', 'yellow'];
const tintAt = (index: number): Tint => TINTS[index % TINTS.length] ?? 'purple';

/** Where "Join" leads: the sign-in screen, which is also how a new member signs up. */
const JOIN = { to: '/login', state: { from: '/' } } as const;
/** "Find Your Partner": sign in, then straight to the people who match. */
const FIND_PARTNER = { to: '/login', state: { from: '/discover' } } as const;

/**
 * The home page for visitors: what GarbaMates is, why it exists and how to join. Signed-in
 * members get their own home (`HomePage`) at the same address; see `HomeGate`.
 *
 * The wording lives in `features/landing/content.ts`. Nothing here loads data.
 */
export function LandingPage() {
  return (
    <div className="space-y-16 pb-4 sm:space-y-20 lg:space-y-24">
      {/* ---------------------------------------------------------------- Hero */}
      <section className="relative overflow-hidden rounded-card bg-primary px-5 py-10 text-white shadow-raised sm:px-10 sm:py-14 lg:px-14 lg:py-16">
        <span
          aria-hidden="true"
          className="absolute -top-24 -right-20 size-80 rounded-full bg-secondary/30 blur-3xl"
        />
        <span
          aria-hidden="true"
          className="absolute -bottom-32 left-1/4 size-80 rounded-full bg-accent-orange/20 blur-3xl"
        />
        <div className="relative grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
          <div>
            <p className="text-label tracking-widest text-accent-yellow uppercase">
              {HERO.eyebrow}
            </p>
            <h1 className="mt-3 text-display text-balance text-white">{APP_TAGLINE}</h1>
            <p className="mt-4 max-w-xl text-white/85 sm:text-lg">{HERO.body}</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <LinkButton {...JOIN} variant="cta">
                Join {APP_NAME}
              </LinkButton>
              <LinkButton to="/events" variant="secondary" size="lg">
                <Icon name="calendar" />
                Explore Events
              </LinkButton>
            </div>
            <p className="mt-4 text-small text-white/70">{HERO.note}</p>
          </div>

          {/* The logo, as supplied, on the cream it was drawn for. */}
          <div className="relative mx-auto w-full max-w-sm lg:max-w-none">
            <Sparkle float className="-top-5 left-4 size-6 text-accent-yellow" />
            <Sparkle
              float
              className="right-2 -bottom-4 size-5 text-accent-orange [animation-delay:1.2s]"
            />
            <div className="rounded-card bg-surface px-6 py-9 shadow-overlay sm:px-8 sm:py-12">
              <Logo className="h-auto w-full" />
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- Find your partner */}
      <section
        aria-labelledby="partner-heading"
        className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14"
      >
        <Reveal>
          <PhotoPanel photo={PARTNER.photo} />
        </Reveal>
        <Reveal delayMs={120}>
          <p className="text-label tracking-widest text-accent-700 uppercase">{PARTNER.eyebrow}</p>
          <h2 id="partner-heading" className="mt-2 text-h1 text-balance">
            {PARTNER.heading}
          </h2>
          <p className="mt-4 text-muted">{PARTNER.body}</p>
          <ul className="mt-5 space-y-3">
            {PARTNER.points.map((point) => (
              <li key={point} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-success-soft text-success"
                >
                  <Icon name="check" className="size-4" />
                </span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <div className="mt-7 flex flex-col sm:flex-row">
            <LinkButton {...FIND_PARTNER} variant="cta">
              <Icon name="heart" />
              {PARTNER.button}
            </LinkButton>
          </div>
        </Reveal>
      </section>

      {/* ---------------------------------------------------------------- How to find Garba mates */}
      <Section heading={FIND.heading} intro={FIND.body}>
        <ul className="grid gap-4 md:grid-cols-3">
          {FIND.ways.map((way, index) => (
            <li key={way.title}>
              <Reveal delayMs={index * 80} className="h-full">
                <Card className="h-full">
                  <Tile tint={way.tint}>
                    <Icon name={way.icon} className="size-6" />
                  </Tile>
                  <h3 className="mt-4 text-h3">{way.title}</h3>
                  <p className="mt-1.5 text-small text-muted">{way.text}</p>
                </Card>
              </Reveal>
            </li>
          ))}
        </ul>
      </Section>

      {/* ---------------------------------------------------------------- How GarbaMates works */}
      <section
        aria-labelledby="how-heading"
        className="rounded-card bg-brand-50 px-5 py-10 ring-1 ring-brand-100 sm:px-10 sm:py-14"
      >
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 id="how-heading" className="text-h1 text-balance">
            {HOW_IT_WORKS.heading}
          </h2>
          <p className="mt-3 text-muted">{HOW_IT_WORKS.body}</p>
        </Reveal>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.steps.map((step, index) => (
            <li key={step.title}>
              <Reveal delayMs={index * 80} className="h-full">
                <Card className="h-full">
                  <span
                    aria-hidden="true"
                    className="flex size-10 items-center justify-center rounded-full bg-primary text-body font-bold text-white"
                  >
                    {index + 1}
                  </span>
                  <h3 className="mt-4 text-h3">
                    <span className="sr-only">Step {index + 1}: </span>
                    {step.title}
                  </h3>
                  <p className="mt-1.5 text-small text-muted">{step.text}</p>
                </Card>
              </Reveal>
            </li>
          ))}
        </ol>
        <div className="mt-8 flex flex-col justify-center sm:flex-row">
          <LinkButton {...JOIN} size="lg">
            Join {APP_NAME}
          </LinkButton>
        </div>
      </section>

      {/* ---------------------------------------------------------------- Community connection */}
      <section
        aria-labelledby="community-heading"
        className="rounded-card bg-accent-50 px-5 py-10 ring-1 ring-accent-100 sm:px-10 sm:py-14"
      >
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 id="community-heading" className="text-h1 text-balance">
            {COMMUNITY.heading}
          </h2>
          <p className="mt-4 text-lg text-ink">{COMMUNITY.lead}</p>
          <ul className="mt-6 space-y-3">
            {COMMUNITY.lines.map((line) => (
              <li key={line} className="text-h3 text-primary">
                {line}
              </li>
            ))}
          </ul>
          <p className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-small font-bold tracking-wide text-accent-yellow uppercase">
            <Icon name="heart" className="size-4" />
            {APP_TAGLINE}
          </p>
        </Reveal>
      </section>

      {/* ---------------------------------------------------------------- Trust and safety */}
      <Section heading={TRUST.heading} intro={TRUST.body}>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {TRUST.cards.map((card, index) => (
            <li key={card.title}>
              <Reveal delayMs={index * 60} className="h-full">
                <Card padding="sm" className="h-full">
                  <Tile tint={tintAt(index + 1)}>{card.emoji}</Tile>
                  <h3 className="mt-3 text-h3">{card.title}</h3>
                  <p className="mt-1.5 text-small text-muted">{card.text}</p>
                </Card>
              </Reveal>
            </li>
          ))}
        </ul>
        <p className="mx-auto mt-6 max-w-2xl text-center text-small text-muted">
          {TRUST.disclaimer} Read our{' '}
          <Link to="/safety" className={TEXT_LINK}>
            safety centre
          </Link>{' '}
          and{' '}
          <Link to="/guidelines" className={TEXT_LINK}>
            community guidelines
          </Link>
          .
        </p>
      </Section>

      {/* ---------------------------------------------------------------- Vision */}
      <section
        aria-labelledby="vision-heading"
        className="relative overflow-hidden rounded-card bg-primary px-5 py-12 text-center text-white shadow-raised sm:px-10 sm:py-16"
      >
        <span
          aria-hidden="true"
          className="absolute -top-28 left-1/2 size-96 -translate-x-1/2 rounded-full bg-secondary/25 blur-3xl"
        />
        <Sparkle
          float
          className="top-4 left-4 size-5 text-accent-yellow sm:top-8 sm:left-[8%] sm:size-6"
        />
        <Sparkle
          float
          className="right-4 bottom-3 size-5 text-accent-orange [animation-delay:1.5s] sm:right-[10%] sm:bottom-10 sm:size-8"
        />
        <Sparkle className="top-10 right-[22%] size-3 text-white/60 max-sm:hidden" />
        <Reveal className="relative mx-auto max-w-3xl">
          <h2
            id="vision-heading"
            className="text-label tracking-widest text-accent-yellow uppercase"
          >
            {VISION.heading}
          </h2>
          <p className="mt-4 text-h1 text-balance text-white">{VISION.body}</p>
          <p className="mt-6 font-semibold text-accent-yellow">{VISION.line}</p>
        </Reveal>
      </section>

      {/* ---------------------------------------------------------------- The journey */}
      <Section heading={JOURNEY.heading}>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {JOURNEY.stages.map((stage, index) => (
            <li key={stage.title}>
              <Reveal delayMs={index * 80} className="h-full">
                <Card className="relative h-full">
                  <span className="text-caption font-bold tracking-widest text-accent-700 uppercase">
                    Step {index + 1}
                  </span>
                  <div className="mt-2 flex items-center gap-3">
                    <Tile tint={tintAt(index + 2)}>{stage.emoji}</Tile>
                    <h3 className="text-h3">{stage.title}</h3>
                  </div>
                  <p className="mt-3 text-small text-muted">{stage.text}</p>
                </Card>
              </Reveal>
            </li>
          ))}
        </ol>
      </Section>

      {/* ---------------------------------------------------------------- Final call to action */}
      <section
        aria-labelledby="join-heading"
        className="relative overflow-hidden rounded-card bg-gradient-to-br from-primary to-accent-700 px-5 py-12 text-center text-white shadow-raised sm:px-10 sm:py-16"
      >
        <Sparkle
          float
          className="top-4 right-4 size-5 text-accent-yellow sm:top-8 sm:right-[12%] sm:size-7"
        />
        <Sparkle
          float
          className="bottom-3 left-4 size-4 text-accent-yellow [animation-delay:0.8s] sm:bottom-8 sm:left-[10%] sm:size-5"
        />
        <Reveal className="relative mx-auto max-w-2xl">
          <h2 id="join-heading" className="text-display text-balance text-white">
            {FINAL_CTA.heading}
          </h2>
          <p className="mt-4 text-white/85 sm:text-lg">{FINAL_CTA.body}</p>
          <p className="text-h3 text-white">{FINAL_CTA.highlight}</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <LinkButton {...JOIN} variant="cta">
              Join {APP_NAME}
            </LinkButton>
            <LinkButton to="/events" variant="secondary" size="lg">
              <Icon name="calendar" />
              Explore Events
            </LinkButton>
          </div>
          <p className="mt-8 text-label tracking-widest text-accent-yellow uppercase">
            {APP_TAGLINE}
          </p>
        </Reveal>
      </section>
    </div>
  );
}
