import type { AdminOrganizerDto, CreateOrganizerInput } from '@garba-partner/shared';

export interface OrganizerFormValues {
  name: string;
  description: string;
  websiteUrl: string;
  instagramHandle: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  notes: string;
}

export const EMPTY_ORGANIZER_VALUES: OrganizerFormValues = {
  name: '',
  description: '',
  websiteUrl: '',
  instagramHandle: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  notes: '',
};

/** Only called for admins with `events:manage`, who always receive `contact`. */
export function organizerToValues(organizer: AdminOrganizerDto): OrganizerFormValues {
  return {
    name: organizer.name,
    description: organizer.description ?? '',
    websiteUrl: organizer.websiteUrl ?? '',
    instagramHandle: organizer.instagramHandle ?? '',
    contactName: organizer.contact?.contactName ?? '',
    contactEmail: organizer.contact?.contactEmail ?? '',
    contactPhone: organizer.contact?.contactPhone ?? '',
    notes: organizer.contact?.notes ?? '',
  };
}

/** Empty optional fields are sent as null (clears them). */
export function organizerValuesToInput(values: OrganizerFormValues): CreateOrganizerInput {
  const orNull = (value: string) => (value.trim() === '' ? null : value);
  return {
    name: values.name,
    description: orNull(values.description),
    websiteUrl: orNull(values.websiteUrl),
    instagramHandle: orNull(values.instagramHandle),
    contactName: orNull(values.contactName),
    contactEmail: orNull(values.contactEmail),
    contactPhone: orNull(values.contactPhone),
    notes: orNull(values.notes),
  };
}
