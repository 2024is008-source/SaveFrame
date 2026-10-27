const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Colombo',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

export function formatAdminTime(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  const date = new Date(Number(value));
  if (!Number.isFinite(date.getTime())) return '—';
  const parts = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} SLST`;
}
