import { Link } from 'react-router';
import { APP_NAME, APP_TAGLINE } from '@garba-partner/shared';
import { Logo, LogoIcon } from '../components/Logo';
import { Badge } from '../components/ui/Badge';
import { LinkButton } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Icon } from '../components/ui/Icon';
import { TEXT_LINK } from '../components/ui/link-styles';
import { Reveal, Section, Sparkle, Tile } from '../features/landing/components';
import {
  ABOUT,
  COMMUNITY,
  FEATURES,
  FEATURES_HEADING,
  FINAL_CTA,
  HERO,
  JOURNEY,
  PERSONAS,
  STORY,
  TRUST,
  VISION,
  type Tint,
} from '../features/landing/content';

const TINTS: Tint[] = ['pink', 'purple', 'orange', 'yellow'];
const tintAt = (index: number): Tint => TINTS[index % TINTS.length] ?? 'purple';

/** Where "Join" leads: the sign-in screen, which is also how a new member signs up. */
const JOIN = { to: '/login', state: { from: '/' } } as const;

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

      {/* ---------------------------------------------------------------- What is GarbaMates? */}
      <section
        aria-labelledby="about-heading"
        className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14"
      >
        <Reveal>
          <h2 id="about-heading" className="text-h1 text-balance">
            {ABOUT.heading}
          </h2>
          <div className="mt-4 space-y-3 text-muted">
            {ABOUT.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <p className="mt-5 border-l-4 border-accent-500 pl-4 text-h3 text-primary">
            {ABOUT.statement}
          </p>
        </Reveal>
        <Reveal delayMs={120}>
          <ul className="grid grid-cols-2 gap-3 sm:gap-4">
            {ABOUT.tiles.map((label, index) => {
              const feature = FEATURES[index];
              return (
                <li
                  key={label}
                  className={`flex aspect-[4/3] flex-col justify-between rounded-card p-4 sm:p-5 ${
                    index % 2 === 1 ? 'lg:translate-y-5' : ''
                  } ${
                    [
                      'bg-accent-100 text-accent-700',
                      'bg-brand-100 text-brand-700',
                      'bg-accent-orange-soft text-primary',
                      'bg-accent-yellow-soft text-primary',
                    ][index] ?? ''
                  }`}
                >
                  {feature && <Icon name={feature.icon} className="size-7" />}
                  <span className="text-h3 text-primary">{label}</span>
                </li>
              );
            })}
          </ul>
        </Reveal>
      </section>

      {/* ---------------------------------------------------------------- Core features */}
      <Section heading={FEATURES_HEADING}>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature, index) => (
            <li key={feature.title}>
              <Reveal delayMs={index * 80} className="h-full">
                <Card interactive className="flex h-full flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <Tile tint={feature.tint}>
                      <Icon name={feature.icon} className="size-6" />
                    </Tile>
                    {feature.comingSoon && <Badge tone="orange">Coming soon</Badge>}
                  </div>
                  <h3 className="mt-4 text-h3">{feature.title}</h3>
                  <p className="mt-1.5 text-small text-muted">{feature.text}</p>
                  {feature.link && (
                    <Link
                      to={feature.link.to}
                      className={`mt-auto inline-flex min-h-11 items-center gap-1 pt-2 text-small ${TEXT_LINK}`}
                    >
                      {feature.link.label}
                      <Icon name="chevron-right" className="size-4" />
                    </Link>
                  )}
                </Card>
              </Reveal>
            </li>
          ))}
        </ul>
      </Section>

      {/* ---------------------------------------------------------------- Made for every Garba lover */}
      <Section heading={PERSONAS.heading} intro={PERSONAS.body}>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PERSONAS.cards.map((persona, index) => (
            <li key={persona.title}>
              <Reveal delayMs={index * 80} className="h-full">
                <Card className="h-full text-center">
                  <Tile tint={tintAt(index)} className="mx-auto size-16 rounded-full text-3xl">
                    {persona.emoji}
                  </Tile>
                  <h3 className="mt-4 text-h3">{persona.title}</h3>
                  <p className="mt-1.5 text-small text-muted">{persona.text}</p>
                </Card>
              </Reveal>
            </li>
          ))}
        </ul>
      </Section>

      {/* ---------------------------------------------------------------- Why we built GarbaMates */}
      <section
        aria-labelledby="story-heading"
        className="relative overflow-hidden rounded-card bg-card px-5 py-10 shadow-card ring-1 ring-brand-900/5 sm:px-10 sm:py-14"
      >
        <span
          aria-hidden="true"
          className="absolute -top-24 -left-24 size-72 rounded-full bg-accent-yellow/25 blur-3xl"
        />
        <span
          aria-hidden="true"
          className="absolute -right-24 -bottom-24 size-72 rounded-full bg-secondary/15 blur-3xl"
        />
        <Reveal className="relative mx-auto max-w-2xl">
          <p className="text-label tracking-widest text-accent-700 uppercase">Our story</p>
          <h2 id="story-heading" className="mt-2 text-h1 text-balance">
            {STORY.heading}
          </h2>
          <div className="mt-5 space-y-3">
            {STORY.intro.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {STORY.maybes.map((maybe) => (
              <li
                key={maybe}
                className="rounded-control bg-brand-50 px-4 py-3 text-small font-semibold text-primary ring-1 ring-brand-100"
              >
                {maybe}
              </li>
            ))}
          </ul>
          <p className="mt-8 text-h2 text-accent-700">{STORY.turn}</p>
          <div className="mt-4 space-y-3">
            {STORY.outro.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <p className="mt-3 text-h3 text-primary">{STORY.closing}</p>
          <div className="mt-8 flex items-center gap-3 border-t border-line pt-6">
            <LogoIcon decorative className="size-12" />
            <p>
              <span className="block text-h3">{APP_NAME}</span>
              <span className="text-small font-semibold text-accent-700">{APP_TAGLINE}</span>
            </p>
          </div>
        </Reveal>
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
