/** Compact, locale-aware date/time formatting for match cards (client-side). */

export function formatDateTime(iso: string | null): string {
  if (!iso) return 'Date TBD';
  const d = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function formatTime(iso: string | null): string {
  if (!iso) return '--:--';
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  );
}

export function formatDate(iso: string | null): string {
  if (!iso) return 'TBD';
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short' }).format(new Date(iso));
}
