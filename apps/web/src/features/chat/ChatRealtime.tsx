import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useAuth } from '../auth/auth-context';
import { startChatSocket } from './chat-socket';
import { addMessageToCache, chatKeys } from './hooks';

/**
 * Connects the chat socket while an ACTIVE member is signed in and turns server events into
 * cache updates. Renders nothing.
 */
export function ChatRealtime() {
  const { state, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const active = state.status === 'authenticated' && state.user.status === 'active';

  useEffect(() => {
    if (!active) return undefined;
    return startChatSocket({
      onMessage: (message) => {
        addMessageToCache(queryClient, message);
        void queryClient.invalidateQueries({ queryKey: chatKeys.list });
        void queryClient.invalidateQueries({ queryKey: chatKeys.unread });
      },
      onRead: ({ matchId }) => {
        void queryClient.invalidateQueries({ queryKey: chatKeys.chat(matchId) });
        void queryClient.invalidateQueries({ queryKey: chatKeys.list });
      },
      onMatchEnded: ({ matchId }) => {
        // The chat is gone for both: refresh everything that shows it.
        void queryClient.invalidateQueries({ queryKey: chatKeys.all });
        void queryClient.invalidateQueries({ queryKey: chatKeys.chat(matchId) });
        void queryClient.invalidateQueries({ queryKey: ['connections'] });
      },
      onSessionEnded: () => {
        // Suspension or session end: re-read the account (the app shows the right state).
        void refreshUser();
      },
    });
  }, [active, queryClient, refreshUser]);

  return null;
}
