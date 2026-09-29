import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AdminSanctionInput } from '@garba-partner/shared';
import { userKeys } from '../users/hooks';
import { liftSanction, sanctionUser, type LiftPath, type SanctionPath } from './moderation-api';

export function useSanctionUser(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ path, body }: { path: SanctionPath; body: AdminSanctionInput }) =>
      sanctionUser(userId, path, body),
    onSuccess: async (user) => {
      queryClient.setQueryData(userKeys.detail(userId), user);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

export function useLiftSanction(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ path, reason }: { path: LiftPath; reason: string }) =>
      liftSanction(userId, path, reason),
    onSuccess: async (user) => {
      queryClient.setQueryData(userKeys.detail(userId), user);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}
