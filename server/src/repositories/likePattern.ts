// Escapes MySQL's LIKE metacharacters (and the escape character itself) so a
// user-supplied search term is matched literally rather than as a pattern —
// otherwise `?q=%` matches every row and `?q=_` matches any single character.
// The value still reaches the query as a bound parameter, so this is about
// search semantics, not SQL injection. The wrapping wildcards are added after
// escaping, so they stay wildcards while anything the caller supplied does not.
export const containsPattern = (value: string): string =>
  `%${value.replace(/[\\%_]/g, '\\$&')}%`;
