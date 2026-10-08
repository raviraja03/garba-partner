import { Link } from 'react-router';
import type { MatchHighlight, PartnerDto } from '@garba-partner/shared';
import { Badge } from '../../../components/ui/Badge';
import { CARD_CLASS } from '../../../components/ui/Card';
import { Icon } from '../../../components/ui/Icon';
import { formatShortDate } from '../../../lib/format';
import { GARBA_LEVEL_LABELS, MATCH_HIGHLIGHT_LABELS } from '../../../lib/labels';
import { ID_VERIFIED_NOTE, PHOTO_VERIFIED_NOTE } from '../../profile/components/VerificationBadges';

/** Why a profile is suggested, in plain words (never a score). */
export function Highlights({ highlights }: { highlights: MatchHighlight[] }) {
  if (highlights.length === 0) return null;
  return (
    <ul aria-label="Why you're seeing this profile" className="flex flex-wrap gap-1.5">
      {highlights.map((highlight) => (
        <li key={highlight}>
          <Badge tone="brand">{MATCH_HIGHLIGHT_LABELS[highlight]}</Badge>
        </li>
      ))}
    </ul>
  );
}

/**
 * Discover card: the public allow-list profile and plain-language reasons. The photo leads;
 * name, age and place sit on it. Location is city (and area only if the member shows it).
 */
export function PartnerCard({ partner }: { partner: PartnerDto }) {
  const { profile } = partner;
  const verified = profile.photoVerified || profile.identityVerified;
  return (
    <article
      className={`${CARD_CLASS} overflow-hidden transition-[box-shadow,transform] duration-200 ease-soft hover:-translate-y-0.5 hover:shadow-raised`}
    >
      <Link to={`/partners/${profile.id}`} className="block rounded-card">
        <div className="relative aspect-[4/5] bg-brand-100">
          {profile.image ? (
            <img
              src={profile.image.url}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-full object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-brand-300">
              <Icon name="user" className="size-20" />
            </div>
          )}
          {partner.connection.status === 'interest_received' && (
            <Badge tone="pink" icon="heart" className="absolute top-3 left-3 shadow-card">
              Interested in you
            </Badge>
          )}
          {/* Dark gradient so the white name stays readable on any photo. */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-brand-900/90 via-brand-900/45 to-transparent px-4 pt-14 pb-3 text-white">
            <h2 className="text-h3 text-white">
              {profile.name}, {profile.age}
            </h2>
            <p className="text-small text-white/90">
              {profile.area ? `${profile.area.name}, ` : ''}
              {profile.city.name}
            </p>
          </div>
        </div>
        <div className="space-y-2.5 p-4">
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="orange">{GARBA_LEVEL_LABELS[profile.garbaLevel].label}</Badge>
            {verified && (
              <Badge
                tone="success"
                icon="check"
                title={profile.identityVerified ? ID_VERIFIED_NOTE : PHOTO_VERIFIED_NOTE}
              >
                {profile.identityVerified ? 'ID verified' : 'Photo verified'}
              </Badge>
            )}
          </div>
          <Highlights highlights={partner.highlights} />
          {partner.sharedEvents[0] && (
            <p className="flex items-start gap-1.5 text-caption text-muted">
              <Icon name="calendar" className="mt-0.5 size-3.5" />
              Also looking at {partner.sharedEvents[0].name}
            </p>
          )}
          {partner.sharedDates.length > 0 && (
            <p className="text-caption text-muted">
              Both free: {partner.sharedDates.slice(0, 3).map(formatShortDate).join(', ')}
            </p>
          )}
        </div>
      </Link>
    </article>
  );
}
