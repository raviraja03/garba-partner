import { Link } from 'react-router';
import type { MatchHighlight, PartnerDto } from '@garba-partner/shared';
import { formatShortDate } from '../../../lib/format';
import { GARBA_LEVEL_LABELS, MATCH_HIGHLIGHT_LABELS } from '../../../lib/labels';

export function Highlights({ highlights }: { highlights: MatchHighlight[] }) {
  if (highlights.length === 0) return null;
  return (
    <ul aria-label="Why you're seeing this profile" className="flex flex-wrap gap-1">
      {highlights.map((highlight) => (
        <li
          key={highlight}
          className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-900"
        >
          {MATCH_HIGHLIGHT_LABELS[highlight]}
        </li>
      ))}
    </ul>
  );
}

/** Discover card: public allow-list profile + plain-language reasons (no score). */
export function PartnerCard({ partner }: { partner: PartnerDto }) {
  const { profile } = partner;
  return (
    <article className="overflow-hidden rounded-card bg-white shadow-sm ring-1 ring-black/5 transition-shadow hover:shadow-md">
      <Link to={`/partners/${profile.id}`} className="block">
        <div className="aspect-[3/4] bg-brand-50">
          {profile.image ? (
            <img src={profile.image.url} alt="" loading="lazy" className="size-full object-cover" />
          ) : null}
        </div>
        <div className="space-y-2 p-4">
          <h2 className="text-lg font-bold">
            {profile.name}, {profile.age}
            {(profile.photoVerified || profile.identityVerified) && (
              <span className="ml-1 text-sm text-green-700" title="Verified">
                ✓
              </span>
            )}
          </h2>
          <p className="text-sm text-muted">
            {GARBA_LEVEL_LABELS[profile.garbaLevel].label} ·{' '}
            {profile.area ? `${profile.area.name}, ` : ''}
            {profile.city.name}
          </p>
          {partner.connection.status === 'interest_received' && (
            <p className="text-sm font-semibold text-accent-700">Interested in you</p>
          )}
          <Highlights highlights={partner.highlights} />
          {partner.sharedEvents[0] && (
            <p className="text-xs text-muted">Also looking at {partner.sharedEvents[0].name}</p>
          )}
          {partner.sharedDates.length > 0 && (
            <p className="text-xs text-muted">
              Both free: {partner.sharedDates.slice(0, 3).map(formatShortDate).join(', ')}
            </p>
          )}
        </div>
      </Link>
    </article>
  );
}
