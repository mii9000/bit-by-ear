import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

const timeZoneValues = new Set<string>(Intl.supportedValuesOf('timeZone'));

export function isSupportedTimeZone(value: string): boolean {
  return value === 'UTC' || timeZoneValues.has(value);
}

export function nextLocalSlot(input: { after: Date; timezone: string; deliveryTime: string }): Date {
  if (!isSupportedTimeZone(input.timezone)) throw new Error('Choose a valid time zone.');
  const time = /^([01]\d|2[0-3]):([0-5]\d)(?::00)?$/.exec(input.deliveryTime);
  if (!time) throw new Error('Choose a valid local delivery time.');
  const deliveryTime = `${time[1]}:${time[2]}`;
  const date = new Date(`${formatInTimeZone(input.after, input.timezone, 'yyyy-MM-dd')}T00:00:00Z`);
  for (let i = 0; i < 3; i += 1) {
    const localDate = date.toISOString().slice(0, 10);
    const candidate = fromZonedTime(`${localDate}T${deliveryTime}:00`, input.timezone);
    if (candidate.getTime() > input.after.getTime()) return candidate;
    date.setUTCDate(date.getUTCDate() + 1);
  }
  throw new Error('Could not schedule the next daily episode.');
}

export function localDateAt(instant: Date, timezone: string): string {
  return formatInTimeZone(instant, timezone, 'yyyy-MM-dd');
}
