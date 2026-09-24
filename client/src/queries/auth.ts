import {
  hashKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import * as authApi from '../api/auth';
import type { LoginInput, RegisterInput } from '../api/auth';
import { ApiError } from '../api/client';
import { queryKeys } from './keys';
import type { PublicUser } from '../types/user';

// `null` means "asked, and nobody is signed in"; `undefined` means "not asked
// yet". TanStack enforces the distinction for us — it rejects an `undefined`
// return from a queryFn outright — so the cache can hold the whole answer.
type Session = PublicUser | null;

interface ConfirmResetInput {
  token: string;
  password: string;
}

const setSession = (client: QueryClient, session: Session): void => {
  client.setQueryData<Session>(queryKeys.session, session);
};

// What `watchSession` needs of a `BroadcastChannel`; a test passes a fake.
export interface SessionChannel {
  postMessage(message: null): void;
  addEventListener(type: 'message', listener: () => void): void;
}

const sessionHash = hashKey(queryKeys.session);

// A session is a cookie every tab of the browser shares, so a sign-in or Sign
// out in one tab changes who every other tab is acting as — a tab still showing
// the old Account would send its writes as the new one. Two duties, for the
// app's one client:
//
// - A session this tab's own mutation wrote (`setQueryData`, so `manual`) is
//   announced on the channel; a tab that hears it asks /auth/me again rather
//   than trusting the message, since the cookie is the truth. `null` where the
//   browser has no BroadcastChannel: `useSession`'s refetch on focus catches up.
// - A different Account (Guest counts as one) invalidates every other query,
//   from whichever path the change arrived: likes, Draft books and
//   notifications are all answered for whoever asks.
// - A 401 on any request while this tab shows an Account is a Lost session
//   noticed mid-page: /auth/me is asked again rather than the session guessed
//   to be `null`, since a sign-in in another tab may have overtaken the
//   request. Other tabs are not told: each asks on focus anyway.
export const watchSession = (
  client: QueryClient,
  channel: SessionChannel | null
): void => {
  channel?.addEventListener('message', () => {
    void client.invalidateQueries({ queryKey: queryKeys.session });
  });

  // undefined until the first answer: nothing to compare it with yet.
  let accountId: number | null | undefined;
  client.getQueryCache().subscribe((event) => {
    if (
      event.type !== 'updated' ||
      event.action.type !== 'success' ||
      event.query.queryHash !== sessionHash
    ) {
      return;
    }
    if (event.action.manual) channel?.postMessage(null);
    const next = (event.action.data as Session)?.id ?? null;
    if (accountId !== undefined && next !== accountId) {
      void client.invalidateQueries({
        predicate: (query) => query.queryHash !== sessionHash,
      });
    }
    accountId = next;
  });

  const onError = (error: unknown): void => {
    if (
      error instanceof ApiError &&
      error.status === 401 &&
      client.getQueryData<Session>(queryKeys.session)
    ) {
      void client.invalidateQueries({ queryKey: queryKeys.session });
    }
  };
  client.getQueryCache().subscribe((event) => {
    if (event.type === 'updated' && event.action.type === 'error') {
      onError(event.action.error);
    }
  });
  client.getMutationCache().subscribe((event) => {
    if (event.type === 'updated' && event.action.type === 'error') {
      onError(event.action.error);
    }
  });
};

export const useSession = () => {
  return useQuery({
    queryKey: queryKeys.session,
    // Even when fresh: a tab that missed another tab's announcement (asleep,
    // or no BroadcastChannel) catches up the moment it is looked at, and so
    // notices a session that expired or was ended by a Block.
    refetchOnWindowFocus: 'always',
    queryFn: async (): Promise<Session> => {
      try {
        return await authApi.me();
      } catch (error) {
        // A 401 means "not logged in" — the ordinary state for a first-time
        // visitor, and a success for this query. Rethrowing would flash an
        // error at every anonymous arrival.
        if (error instanceof ApiError && error.status === 401) {
          return null;
        }
        throw error;
      }
    },
  });
};

// Every mutation below writes the session with `setQueryData` rather than
// `invalidateQueries`: the response body *is* the new session, so refetching
// /auth/me would re-ask a question the response already answered.
//
// `login`, `register` and `requestReset` are wrapped in a one-line arrow
// rather than passed by reference: the installed TanStack Query build calls
// `mutationFn(variables, mutationFnContext)`, and a point-free reference
// would forward that second, internal context object straight to the api
// layer. The wrapper is the same shape `useConfirmReset` already needs for
// its two-positional-argument call — it just also applies here.
export const useLogin = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => authApi.login(input),
    onSuccess: (user) => setSession(client, user),
  });
};

export const useRegister = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterInput) => authApi.register(input),
    onSuccess: (user) => setSession(client, user),
  });
};

export const useLogout = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => setSession(client, null),
  });
};

export const useRequestReset = () => {
  return useMutation({
    mutationFn: (email: string) => authApi.requestReset(email),
  });
};

export const useConfirmReset = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ token, password }: ConfirmResetInput) =>
      authApi.confirmReset(token, password),
    // The server destroys every session for the user on a successful reset —
    // this one included — so the client must not keep showing a signed-in
    // header.
    onSuccess: () => setSession(client, null),
  });
};
