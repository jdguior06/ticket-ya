const TZ = 'America/La_Paz';

/** 20050 -> "Bs 200,50" */
export function bs(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '—';
  const value = cents / 100;
  return `Bs ${value.toLocaleString('es-BO', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

const dayFmt = new Intl.DateTimeFormat('es-BO', { timeZone: TZ, day: 'numeric' });
const monthFmt = new Intl.DateTimeFormat('es-BO', { timeZone: TZ, month: 'short' });
const weekdayFmt = new Intl.DateTimeFormat('es-BO', { timeZone: TZ, weekday: 'long' });
const timeFmt = new Intl.DateTimeFormat('es-BO', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const longFmt = new Intl.DateTimeFormat('es-BO', {
  timeZone: TZ,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function dateParts(iso: string) {
  const d = new Date(iso);
  return {
    day: dayFmt.format(d),
    month: monthFmt.format(d).replace('.', ''),
    weekday: cap(weekdayFmt.format(d)),
    time: timeFmt.format(d),
  };
}

/** "Sábado, 5 de diciembre de 2026 · 19:00" -> usamos coma, sin punto medio */
export function longDate(iso: string): string {
  const d = new Date(iso);
  return `${cap(longFmt.format(d))}, ${timeFmt.format(d)} h`;
}

export function timeOnly(iso: string): string {
  return timeFmt.format(new Date(iso));
}

/** Valor para <input type="datetime-local"> en hora de Bolivia. */
export function toLocalInput(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 4 * 3600e3); // Bolivia: UTC-4 todo el año
  return d.toISOString().slice(0, 16);
}

/** "2026-12-05T19:00" (hora de Bolivia) -> ISO UTC */
export function fromLocalInput(value: string): string {
  return new Date(`${value}:00-04:00`).toISOString();
}

export function bsToCents(text: string): number {
  const n = Number(text.replace(',', '.'));
  return Math.round(n * 100);
}
