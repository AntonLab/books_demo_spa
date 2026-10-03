// The one way the client writes a span of time, like `format/date.ts` for a
// moment. Every unit is floored and only the two largest are shown.
export const formatDuration = (seconds: number | null): string => {
  if (seconds === null) return '—';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return '< 1 min';
  const hours = Math.floor(minutes / 60);
  if (hours < 1) return `${minutes} min`;
  const days = Math.floor(hours / 24);
  if (days < 1) {
    const m = minutes % 60;
    return m === 0 ? `${hours} h` : `${hours} h ${m} min`;
  }
  const h = hours % 24;
  return h === 0 ? `${days} d` : `${days} d ${h} h`;
};
