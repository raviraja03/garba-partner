import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MyProfileDto } from '@garba-partner/shared';
import { useAuth } from '../auth/auth-context';
import {
  createProfile,
  deleteProfileImage,
  fetchAreas,
  fetchCities,
  fetchMyProfile,
  fetchProfilePreview,
  updatePreferences,
  updateProfile,
  uploadProfileImage,
} from './profile-api';

export const profileKeys = {
  mine: ['me', 'profile'] as const,
  preview: ['me', 'profile', 'preview'] as const,
  cities: ['cities'] as const,
  areas: (cityId: string) => ['cities', cityId, 'areas'] as const,
};

export function useMyProfile() {
  return useQuery({ queryKey: profileKeys.mine, queryFn: fetchMyProfile });
}

export function useProfilePreview(enabled: boolean) {
  return useQuery({ queryKey: profileKeys.preview, queryFn: fetchProfilePreview, enabled });
}

export function useCities() {
  return useQuery({ queryKey: profileKeys.cities, queryFn: fetchCities, staleTime: 10 * 60_000 });
}

export function useAreas(cityId: string | null) {
  return useQuery({
    queryKey: profileKeys.areas(cityId ?? 'none'),
    queryFn: () => fetchAreas(cityId ?? ''),
    enabled: cityId !== null,
    staleTime: 10 * 60_000,
  });
}

/**
 * Every profile mutation returns the fresh MyProfileDto: store it, invalidate the preview, and
 * refresh the auth user (onboarding status / display name may have changed).
 */
function useProfileMutation<TInput>(mutationFn: (input: TInput) => Promise<MyProfileDto>) {
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();
  return useMutation({
    mutationFn,
    onSuccess: async (profile) => {
      queryClient.setQueryData(profileKeys.mine, profile);
      await queryClient.invalidateQueries({ queryKey: profileKeys.preview });
      await refreshUser();
    },
  });
}

export const useCreateProfile = () => useProfileMutation(createProfile);
export const useUpdateProfile = () => useProfileMutation(updateProfile);
export const useUpdatePreferences = () => useProfileMutation(updatePreferences);
export const useUploadProfileImage = () => useProfileMutation(uploadProfileImage);
export const useDeleteProfileImage = () => useProfileMutation(() => deleteProfileImage());
