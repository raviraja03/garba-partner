import type { PublicProfileDto } from '@garba-partner/shared';
import { formatShortDate } from '../../../lib/format';
import { GARBA_LEVEL_LABELS, GENDER_LABELS } from '../../../lib/labels';

/** How other members see a profile (renders the public allow-list DTO only). */
export function ProfileCard({ profile }: { profile: PublicProfileDto }) {
  return (
    <article className="overflow-hidden rounded-card bg-white shadow-sm ring-1 ring-black/5">
      <div className="aspect-[3/4] bg-brand-50">
        {profile.image ? (
          <img src={profile.image.url} alt={profile.name} className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-sm text-muted">
            No photo
          </div>
        )}
      </div>
      <div className="space-y-3 p-5">
        <div>
          <h3 className="text-xl font-bold">
            {profile.name}, {profile.age}
            {profile.photoVerified && (
              <span
                className="ml-2 rounded-full bg-green-100 px-2 py-0.5 align-middle text-xs font-semibold text-green-800"
                title="This member took a live selfie that matched their profile photo. Verification does not guarantee a person's identity, intentions or safety."
              >
                Photo verified
              </span>
            )}
            {profile.identityVerified && (
              <span
                className="ml-2 rounded-full bg-green-100 px-2 py-0.5 align-middle text-xs font-semibold text-green-800"
                title="This member completed an identity check with a licensed provider. Verification does not guarantee a person's intentions or safety."
              >
                ID verified
              </span>
            )}
          </h3>
          <p className="text-sm text-muted">
            {GENDER_LABELS[profile.gender]} · {profile.area ? `${profile.area.name}, ` : ''}
            {profile.city.name}
          </p>
        </div>
        <p className="inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-900">
          {GARBA_LEVEL_LABELS[profile.garbaLevel].label}
        </p>
        {profile.bio && <p className="text-sm whitespace-pre-wrap">{profile.bio}</p>}
        {profile.availableDates.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted uppercase">Free to dance on</p>
            <ul className="mt-1 flex flex-wrap gap-1">
              {profile.availableDates.map((date) => (
                <li
                  key={date}
                  className="rounded-full bg-surface px-2 py-0.5 text-xs ring-1 ring-black/5"
                >
                  {formatShortDate(date)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </article>
  );
}
