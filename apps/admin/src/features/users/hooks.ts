import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchUser,
  fetchUsers,
  reactivateUser,
  suspendUser,
  type UserListFilters,
} from './users-api';

export const userKeys = {
  list: (filters: UserListFilters) => ['admin', 'users', filters] as const,
  detail: (userId: string) => ['admin', 'user', userId] as const,
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

export function useUserStatusAction(userId: string, action: 'suspend' | 'reactivate') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) =>
      action === 'suspend' ? suspendUser(userId, reason) : reactivateUser(userId, reason),
    onSuccess: async (user) => {
      queryClient.setQueryData(userKeys.detail(userId), user);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}
