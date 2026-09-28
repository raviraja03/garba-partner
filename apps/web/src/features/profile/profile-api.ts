import type {
  AreaDto,
  CityDto,
  CreateProfileInput,
  MyProfileDto,
  PublicProfileDto,
  UpdatePreferencesInput,
  UpdateProfileInput,
} from '@garba-partner/shared';
import { api } from '../../lib/api-client';

export const fetchMyProfile = () => api<MyProfileDto>('/me/profile', { authenticated: true });

export const fetchProfilePreview = () =>
  api<PublicProfileDto>('/me/profile/preview', { authenticated: true });

export const createProfile = (input: CreateProfileInput) =>
  api<MyProfileDto>('/me/profile', { method: 'POST', body: input, authenticated: true });

export const updateProfile = (input: UpdateProfileInput) =>
  api<MyProfileDto>('/me/profile', { method: 'PATCH', body: input, authenticated: true });

export const updatePreferences = (input: UpdatePreferencesInput) =>
  api<MyProfileDto>('/me/preferences', { method: 'PUT', body: input, authenticated: true });

export function uploadProfileImage(file: File): Promise<MyProfileDto> {
  const formData = new FormData();
  formData.append('image', file);
  return api<MyProfileDto>('/me/profile/image', { method: 'POST', formData, authenticated: true });
}

export const deleteProfileImage = () =>
  api<MyProfileDto>('/me/profile/image', { method: 'DELETE', authenticated: true });

export const fetchCities = () => api<CityDto[]>('/cities');

export const fetchAreas = (cityId: string) => api<AreaDto[]>(`/cities/${cityId}/areas`);
