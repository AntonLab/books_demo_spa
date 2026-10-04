// `Response` does not exist under jsdom (no fetch API, and Jest does not copy
// Node's globals in). These fixtures supply the four members `api/client.ts`
// reads.
interface ResponseLike {
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<unknown>;
}

const build = (status: number, json: () => Promise<unknown>): Response => {
  const response: ResponseLike = {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    json,
  };
  return response as unknown as Response;
};

export const jsonResponse = (body: unknown, status = 200): Response => {
  return build(status, () => Promise.resolve(body));
};

// A 204, an empty 202, and a non-JSON error page all behave the same way to a
// caller: `json()` rejects. One fixture covers all three.
export const emptyResponse = (status: number): Response => {
  return build(status, () =>
    Promise.reject(new SyntaxError('Unexpected end of JSON input'))
  );
};
