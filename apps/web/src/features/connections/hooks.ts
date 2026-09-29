import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acceptInterest,
  fetchMatch,
  fetchMatches,
  fetchReceived,
  fetchSent,
  rejectInterest,
  sendInterest,
  unmatch,
  withdrawInterest,
} from './connections-api';

/** Everything about interests, matches and discovery changes together. */
export const connectionKeys = {
  all: ['connections'] as const,
  received: ['connections', 'received'] as const,
  sent: ['connections', 'sent'] as const,
  matches: ['connections', 'matches'] as const,
  match: (matchId: string) => ['connections', 'match', matchId] as const,
};

function useCursorList<T>(
  key: readonly unknown[],
  fetchPage: (cursor: string | null) => Promise<{ items: T[]; nextCursor: string | null }>,
) {
  return useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

export const useReceivedInterests = () => useCursorList(connectionKeys.received, fetchReceived);
export const useSentInterests = () => useCursorList(connectionKeys.sent, fetchSent);
export const useMatches = () => useCursorList(connectionKeys.matches, fetchMatches);

export function useMatch(matchId: string) {
  return useQuery({ queryKey: connectionKeys.match(matchId), queryFn: () => fetchMatch(matchId) });
}

/** Any change refreshes interests, matches and discovery (connection status on cards). */
function useConnectionMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: connectionKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['partners'] }),
      ]);
    },
  });
}

export const useSendInterest = () => useConnectionMutation(sendInterest);
export const useAcceptInterest = () => useConnectionMutation(acceptInterest);
export const useRejectInterest = () => useConnectionMutation(rejectInterest);
export const useWithdrawInterest = () => useConnectionMutation(withdrawInterest);
export const useUnmatch = () => useConnectionMutation(unmatch);
