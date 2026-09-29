import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  closeMatch,
  fetchUser,
  fetchUserMatches,
  fetchUsers,
  setInteractionRestriction,
  type UserListFilters,
} from './users-api';

export const userKeys = {
  list: (filters: UserListFilters) => ['admin', 'users', filters] as const,
  detail: (userId: string) => ['admin', 'user', userId] as const,
  matches: (userId: string) => ['admin', 'user', userId, 'matches'] as const,
};

export function useUserList(filters: UserListFilters) {
  return useInfiniteQuery({
    queryKey: userKeys.list(filters),
    queryFn: ({ pageParam }) => fetchUsers(filters, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

export function useUser(userId: string) {
  return useQuery({ queryKey: userKeys.detail(userId), queryFn: () => fetchUser(userId) });
}

export function useUserMatches(userId: string) {
  return useQuery({ queryKey: userKeys.matches(userId), queryFn: () => fetchUserMatches(userId) });
}

export function useCloseMatch(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ matchId, reason }: { matchId: string; reason: string }) =>
      closeMatch(matchId, reason),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: userKeys.matches(userId) }),
        queryClient.invalidateQueries({ queryKey: userKeys.detail(userId) }),
      ]);
    },
  });
}

export function useInteractionRestriction(userId: string, restrict: boolean) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) => setInteractionRestriction(userId, restrict, reason),
    onSuccess: (user) => {
      queryClient.setQueryData(userKeys.detail(userId), user);
    },
  });
}
