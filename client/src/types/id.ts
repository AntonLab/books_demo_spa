// A value the server could hold as a record id; anything else is not asked.
export const isId = (n: unknown): n is number =>
  Number.isInteger(n) && (n as number) > 0;
