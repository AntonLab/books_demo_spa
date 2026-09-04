import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import * as authApi from '../api/auth';
import type { LoginInput, RegisterInput } from '../api/auth';
import { ApiError } from '../api/client';
import { queryKeys } from './keys';
import type { PublicUser } from '../types/user';

// `null` means "asked, and nobody is signed in"; `undefined` means "not asked
// yet". TanStack enforces the distinction for us — it rejects an `undefined`
// return from a queryFn outright — so the cache can hold the whole answer.
export type Session = PublicUser | null;

export interface ConfirmResetInput {
  token: string;
  password: string;
}

function setSession(client: QueryClient, session: Session): void {
  client.setQueryData<Session>(queryKeys.session, session);
}

export function useSession() {
  return useQuery({
    queryKey: queryKeys.session,
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
}

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
export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => authApi.login(input),
    onSuccess: (user) => setSession(client, user),
  });
}

export function useRegister() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterInput) => authApi.register(input),
    onSuccess: (user) => setSession(client, user),
  });
}

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => setSession(client, null),
  });
}

export function useRequestReset() {
  return useMutation({
    mutationFn: (email: string) => authApi.requestReset(email),
  });
}

export function useConfirmReset() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ token, password }: ConfirmResetInput) =>
      authApi.confirmReset(token, password),
    // The server destroys every session for the user on a successful reset —
    // this one included — so the client must not keep showing a signed-in
    // header.
    onSuccess: () => setSession(client, null),
  });
}
