import { describe, expect, it } from 'vitest';
import { nextLocalSlot } from '../src/server/schedule.js';

describe('daily episode schedule', () => {
  it('accepts the local time and PostgreSQL time representations', () => {
    const after = new Date('2026-10-25T06:00:00.000Z');
    const localTime = nextLocalSlot({ after, timezone: 'Europe/Amsterdam', deliveryTime: '08:00' });
    const databaseTime = nextLocalSlot({ after, timezone: 'Europe/Amsterdam', deliveryTime: '08:00:00' });

    expect(databaseTime).toEqual(localTime);
  });
});
