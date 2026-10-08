import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { GARBA_LEVELS, isIsoDate, todayInIndia, type GarbaLevel } from '@garba-partner/shared';
import { PageHeader } from '../components/PageHeader';
import { Alert } from '../components/ui/Alert';
import { Button, LinkButton } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { cx } from '../components/ui/cx';
import { Drawer } from '../components/ui/Dialog';
import { EmptyState } from '../components/ui/EmptyState';
import { Field } from '../components/ui/Field';
import { Icon } from '../components/ui/Icon';
import { Input, Select } from '../components/ui/Input';
import { LoadingRegion, SkeletonCard } from '../components/ui/Skeleton';
import { PartnerCard } from '../features/partners/components/PartnerCard';
import { useMyEvents, usePartnerList } from '../features/partners/hooks';
import type { PartnerFilters } from '../features/partners/partners-api';
import { useCities, useMyProfile } from '../features/profile/hooks';
import { ApiClientError } from '../lib/api-client';
import { GARBA_LEVEL_LABELS } from '../lib/labels';
import { useIsDesktop } from '../lib/use-media-query';

const ALL_CITIES = 'all';
/** URL parameters that are filters (for "Clear all" and the active-filter count). */
const FILTER_KEYS = ['event', 'city', 'date', 'minAge', 'maxAge', 'level', 'verified'] as const;

function isGarbaLevel(value: string): value is GarbaLevel {
  return (GARBA_LEVELS as readonly string[]).includes(value);
}

/**
 * Partner discovery. Filters live in the URL (`?city=…&event=…&level=beginner,advanced&date=…
 * &minAge=…&maxAge=…&verified=1`). Results are ranked by the server; no score is shown.
 *
 * Desktop: filters in a side panel next to the results. Phones and tablets: a "Filters"
 * button opens them in a bottom sheet. Filters apply as soon as they change.
 */
export function DiscoverPage() {
  const [params, setParams] = useSearchParams();
  const myProfile = useMyProfile();
  const cities = useCities();
  const myEvents = useMyEvents();
  const isDesktop = useIsDesktop();
  const [sheetOpen, setSheetOpen] = useState(false);
  const ownCityId = myProfile.data?.profile?.city.id ?? '';

  const cityParam = params.get('city');
  const rawDate = params.get('date') ?? '';
  const filters: PartnerFilters = {
    eventId: params.get('event') ?? '',
    // Default to the member's own city; "all" searches every city (same city still ranks higher).
    cityId: cityParam === ALL_CITIES ? '' : (cityParam ?? ownCityId),
    minAge: params.get('minAge') ?? '',
    maxAge: params.get('maxAge') ?? '',
    garbaLevels: (params.get('level') ?? '').split(',').filter(isGarbaLevel),
    date: isIsoDate(rawDate) ? rawDate : '',
    verifiedOnly: params.get('verified') === '1',
  };
  // Wait for the profile so the first search already uses the member's city.
  const list = usePartnerList(filters, !myProfile.isPending);
  const partners = list.data?.pages.flatMap((page) => page.items) ?? [];
  const lookingEvents = (myEvents.data ?? []).filter((attendance) => attendance.lookingForPartner);
  const activeFilters = FILTER_KEYS.filter((key) => params.has(key)).length;

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true });
  }

  function toggleLevel(level: GarbaLevel) {
    const levels = filters.garbaLevels.includes(level)
      ? filters.garbaLevels.filter((l) => l !== level)
      : [...filters.garbaLevels, level];
    update({ level: levels.join(',') || null });
  }

  const clearAll = () => {
    update(Object.fromEntries(FILTER_KEYS.map((key) => [key, null])));
  };

  const error = list.error instanceof ApiClientError ? list.error : null;
  const discoveryOff = myProfile.data?.preferences?.discoveryEnabled === false;

  const filterFields = (
    <form
      aria-label="Filter partners"
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
      }}
    >
      <Field id="filter-city" label="City">
        <Select
          id="filter-city"
          value={cityParam === ALL_CITIES ? ALL_CITIES : filters.cityId}
          onChange={(e) => {
            update({ city: e.target.value === ownCityId ? null : e.target.value });
          }}
        >
          <option value={ALL_CITIES}>All cities</option>
          {cities.data?.map((city) => (
            <option key={city.id} value={city.id}>
              {city.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        id="filter-event"
        label="Event"
        hint={
          lookingEvents.length === 0
            ? 'Events where you are looking for a partner appear here.'
            : undefined
        }
      >
        <Select
          id="filter-event"
          value={filters.eventId}
          aria-describedby={lookingEvents.length === 0 ? 'filter-event-hint' : undefined}
          onChange={(e) => {
            update({ event: e.target.value || null });
          }}
        >
          <option value="">Any event</option>
          {lookingEvents.map((attendance) => (
            <option key={attendance.event.id} value={attendance.event.id}>
              {attendance.event.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field id="filter-date" label="Free on">
        <Input
          id="filter-date"
          type="date"
          min={todayInIndia()}
          value={filters.date}
          onChange={(e) => {
            update({ date: e.target.value || null });
          }}
        />
      </Field>

      <fieldset>
        <legend className="text-label">Age</legend>
        <div className="mt-1.5 flex items-center gap-2">
          <Input
            fieldGap={false}
            type="number"
            inputMode="numeric"
            min={18}
            max={80}
            placeholder="From"
            aria-label="Minimum age"
            aria-describedby="filter-age-hint"
            value={filters.minAge}
            onChange={(e) => {
              update({ minAge: e.target.value || null });
            }}
          />
          <span aria-hidden="true" className="text-muted">
            –
          </span>
          <Input
            fieldGap={false}
            type="number"
            inputMode="numeric"
            min={18}
            max={80}
            placeholder="To"
            aria-label="Maximum age"
            aria-describedby="filter-age-hint"
            value={filters.maxAge}
            onChange={(e) => {
              update({ maxAge: e.target.value || null });
            }}
          />
        </div>
        <p id="filter-age-hint" className="mt-1.5 text-caption text-muted">
          Narrows, but never widens, the age range in your preferences.
        </p>
      </fieldset>

      <fieldset>
        <legend className="text-label">Garba level</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {GARBA_LEVELS.map((level) => {
            const checked = filters.garbaLevels.includes(level);
            return (
              <label
                key={level}
                className={cx(
                  'flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full px-4 text-small font-semibold ring-1 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-500',
                  checked
                    ? 'bg-brand-600 text-white ring-brand-600'
                    : 'bg-card text-ink ring-brand-200 hover:bg-brand-50',
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    toggleLevel(level);
                  }}
                  className="sr-only"
                />
                {checked && <Icon name="check" className="size-4" />}
                {GARBA_LEVEL_LABELS[level].label}
              </label>
            );
          })}
        </div>
      </fieldset>

      <label className="flex min-h-11 cursor-pointer items-center gap-3 font-semibold text-ink">
        <input
          type="checkbox"
          checked={filters.verifiedOnly}
          onChange={(e) => {
            update({ verified: e.target.checked ? '1' : null });
          }}
          className="size-5 shrink-0 accent-brand-600"
        />
        Verified members only
      </label>
    </form>
  );

  const count = list.isSuccess
    ? `${String(partners.length)}${list.hasNextPage ? '+' : ''} ${partners.length === 1 ? 'member' : 'members'}`
    : '';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Discover partners"
        description="Members who match your preferences, and whose preferences you match."
      />

      {discoveryOff && (
        <Alert tone="warning" title="You're browsing while hidden">
          Other members can&apos;t find you.{' '}
          <LinkButton to="/profile/preferences" variant="link">
            Turn on discovery
          </LinkButton>
        </Alert>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        {isDesktop && (
          <Card as="aside" aria-label="Filters" className="sticky top-22 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-h3">Filters</h2>
              {activeFilters > 0 && (
                <Button variant="link" onClick={clearAll}>
                  Clear all
                </Button>
              )}
            </div>
            {filterFields}
          </Card>
        )}

        <section aria-label="Results" className="space-y-5">
          <div className="flex min-h-11 items-center justify-between gap-3">
            <p role="status" className="text-small font-semibold text-muted">
              {count}
            </p>
            {!isDesktop && (
              <Button
                variant="secondary"
                size="sm"
                fullWidth={false}
                aria-haspopup="dialog"
                onClick={() => {
                  setSheetOpen(true);
                }}
              >
                <Icon name="filter" className="size-4.5" />
                Filters
                {activeFilters > 0 && (
                  <span className="flex size-5 items-center justify-center rounded-full bg-accent-600 text-[0.75rem] font-bold text-white">
                    {activeFilters}
                  </span>
                )}
              </Button>
            )}
          </div>

          {error?.code === 'ONBOARDING_REQUIRED' && (
            <EmptyState
              icon="user"
              title="Finish your profile first"
              action={<LinkButton to="/profile/edit">Complete profile</LinkButton>}
            >
              Add a photo and the required details to discover partners.
            </EmptyState>
          )}
          {error?.code === 'PARTNER_TOGGLE_REQUIRED' && (
            <Alert tone="info">
              Turn on “I’m looking for a partner” for this event to see who else is.
            </Alert>
          )}
          {error && !['ONBOARDING_REQUIRED', 'PARTNER_TOGGLE_REQUIRED'].includes(error.code) && (
            <EmptyState
              tone="error"
              title="We couldn't load partners"
              action={
                <Button variant="secondary" fullWidth={false} onClick={() => void list.refetch()}>
                  Try again
                </Button>
              }
            >
              {error.message}
            </EmptyState>
          )}
          {list.isPending && (
            <LoadingRegion
              label="Finding partners…"
              className="grid gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3"
            >
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <SkeletonCard key={i} aspect="aspect-[4/5]" />
              ))}
            </LoadingRegion>
          )}
          {!list.isPending && !list.isError && partners.length === 0 && (
            <EmptyState
              icon="compass"
              title="No one matches yet"
              action={
                activeFilters > 0 ? (
                  <Button variant="secondary" fullWidth={false} onClick={clearAll}>
                    Clear filters
                  </Button>
                ) : (
                  <LinkButton to="/profile/preferences" variant="secondary">
                    Review your preferences
                  </LinkButton>
                )
              }
            >
              Check back closer to the event, try another city, or widen your preferences.
            </EmptyState>
          )}

          {partners.length > 0 && (
            <div className="grid gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
              {partners.map((partner) => (
                <PartnerCard key={partner.profile.id} partner={partner} />
              ))}
            </div>
          )}

          {list.hasNextPage && (
            <div className="flex justify-center">
              <Button
                variant="secondary"
                fullWidth={false}
                loading={list.isFetchingNextPage}
                onClick={() => void list.fetchNextPage()}
              >
                Show more
              </Button>
            </div>
          )}

          {partners.length > 0 && (
            <p className="text-caption text-muted">
              Suggestions are ordered by simple signals like shared events and dates. They say
              nothing about whether someone is a good or safe match.
            </p>
          )}
        </section>
      </div>

      {!isDesktop && (
        <Drawer
          side="bottom"
          open={sheetOpen}
          onClose={() => {
            setSheetOpen(false);
          }}
          title="Filters"
          footer={
            <>
              <Button variant="secondary" disabled={activeFilters === 0} onClick={clearAll}>
                Clear all
              </Button>
              <Button
                onClick={() => {
                  setSheetOpen(false);
                }}
              >
                {list.isSuccess ? `Show ${count}` : 'Show results'}
              </Button>
            </>
          }
        >
          {filterFields}
        </Drawer>
      )}
    </div>
  );
}
