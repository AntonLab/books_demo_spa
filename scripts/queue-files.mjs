/**
 * Which files under docs/superpowers/queue/ belong to the queue run that a
 * worktree named `queue-<date>[-<letter>]` carried. The run's files are
 * `<date>-queue[-<letter>]` with `.json`, `.log` or `.map.md`, plus every
 * `<date>-queue[-<letter>]-*.md` brief or report.
 */
export function queueFilesFor(name, files) {
  const match = name.match(/^queue-(\d{4}-\d{2}-\d{2})(-[a-z])?$/);
  if (!match) return [];
  const stem = `${match[1]}-queue${match[2] ?? ''}`;
  return files.filter((file) => {
    if (!file.startsWith(stem)) return false;
    const rest = file.slice(stem.length);
    // `2026-10-23-queue` must not take `2026-10-23-queue-b…`, a run of its own.
    if (!match[2] && /^-[a-z](?![a-z])/.test(rest)) return false;
    return /^(\.json|\.log|\.map\.md|-.+\.md)$/.test(rest);
  });
}
