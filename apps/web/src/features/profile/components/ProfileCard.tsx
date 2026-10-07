import type { PublicProfileDto } from '@garba-partner/shared';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { Icon } from '../../../components/ui/Icon';
import { formatShortDate } from '../../../lib/format';
import { GARBA_LEVEL_LABELS, GENDER_LABELS } from '../../../lib/labels';
import { VerificationBadges } from './VerificationBadges';

/**
 * How other members see a profile (renders the public allow-list DTO only: no phone number,
 * no date of birth, and the area only when the member chose to show it).
 *
 * `heading`: the level of the name. Use `h1` when the card is the page (a partner's profile).
 */
export function ProfileCard({
  profile,
  heading: Heading = 'h3',
}: {
  profile: PublicProfileDto;
  heading?: 'h1' | 'h2' | 'h3';
}) {
  const level = GARBA_LEVEL_LABELS[profile.garbaLevel];
  return (
    <Card as="article" padding="none">
      <div className="aspect-[4/5] bg-brand-100">
        {profile.image ? (
          <img
            src={profile.image.url}
            alt={profile.name}
            decoding="async"
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-brand-400">
            <Icon name="user" className="size-16" />
            <span className="text-small text-muted">No photo yet</span>
          </div>
        )}
      </div>
      <div className="space-y-4 p-5">
        <div className="space-y-1.5">
          <Heading className="text-h2">
            {profile.name}, {profile.age}
          </Heading>
          <p className="text-small text-muted">
            {GENDER_LABELS[profile.gender]} · {profile.area ? `${profile.area.name}, ` : ''}
            {profile.city.name}
          </p>
          <VerificationBadges
            photoVerified={profile.photoVerified}
            identityVerified={profile.identityVerified}
          />
        </div>

        <div>
          <Badge tone="orange" title={level.hint}>
            {level.label} dancer
          </Badge>
          <p className="mt-1 text-caption text-muted">{level.hint}</p>
        </div>

        {profile.bio && <p className="text-body whitespace-pre-wrap">{profile.bio}</p>}

        {profile.availableDates.length > 0 && (
          <div>
            <p className="text-label text-muted">Free to dance on</p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {profile.availableDates.map((date) => (
                <li key={date}>
                  <Badge tone="brand">{formatShortDate(date)}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
