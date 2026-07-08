export function isToday(date: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const compareDate = new Date(date);
  compareDate.setHours(0, 0, 0, 0);
  return compareDate.getTime() === today.getTime();
}

export function formatLogHeader(date: Date): string {
  if (isToday(date)) {
    return "Today's Log";
  }
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }) + "'s Log";
}

/**
 * Get the user's local date in YYYY-MM-DD format.
 * This is the unambiguous "day" the meal belongs to, regardless of timezone.
 * Used for cross-device consistency.
 */
export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse a YYYY-MM-DD date string into a Date object set to midnight local time.
 */
export function parseLocalDateString(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

/**
 * Format a date string as a short label (e.g. "Jan 5") for chart axes and
 * tooltips. A bare YYYY-MM-DD string is parsed as local midnight so it
 * doesn't shift a day under UTC-behind timezones; anything else is parsed
 * as-is.
 */
export function formatShortDate(dateString: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateString)
    ? new Date(`${dateString}T00:00:00`)
    : new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
