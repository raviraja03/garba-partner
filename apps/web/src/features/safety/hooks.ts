import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acknowledgeWarning,
  fetchBlockedMembers,
  fetchMySafety,
  unblockMember,
} from './safety-api';

export const safetyKeys = {
  mine: ['safety', 'mine'] as const,
  blocked: ['safety', 'blocked'] as const,
};

/** Refreshed on focus and every few minutes, so a new warning or restriction shows up. */
export function useMySafety(enabled: boolean) {
  return useQuery({
    queryKey: safetyKeys.mine,
    queryFn: fetchMySafety,
    enabled,
    refetchInterval: 5 * 60_000,
  });
}

export function useAcknowledgeWarning() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: acknowledgeWarning,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: safetyKeys.mine }),
  });
}

export function useBlockedMembers() {
  return useQuery({ queryKey: safetyKeys.blocked, queryFn: fetchBlockedMembers });
}

/** Unblocking restores nothing: earlier matches and chats stay ended. */
export function useUnblockMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: unblockMember,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: safetyKeys.blocked }),
        queryClient.invalidateQueries({ queryKey: ['partners'] }),
      ]);
    },
  });
}
