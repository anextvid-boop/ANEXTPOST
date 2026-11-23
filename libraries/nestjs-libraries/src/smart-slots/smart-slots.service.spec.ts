import { SmartSlotsService } from './smart-slots.service';

describe('SmartSlotsService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function makePrismaMock({
    timezone = null as string | null,
    scheduled = [] as { publishDate: Date }[],
    published = [] as { publishDate: Date; analytics?: { value: number }[] }[],
  } = {}) {
    return {
      integration: {
        findFirst: jest.fn().mockResolvedValue({
          timezone,
          providerIdentifier: 'linkedin',
          disabled: false,
        }),
      },
      post: {
        findMany: jest.fn().mockImplementation((args: any) => {
          if (args?.where?.state === 'QUEUE') return Promise.resolve(scheduled);
          return Promise.resolve(published);
        }),
      },
    } as any;
  }

  it('produces non-:00 minute-jittered slots', async () => {
    const svc = new SmartSlotsService(makePrismaMock({ timezone: 'Europe/London' }));
    const res = await svc.suggest('org-1', 'int-1', 'linkedin', 3);
    expect(res.length).toBe(3);
    for (const item of res) {
      const minutes = new Date(item.datetime).getUTCMinutes();
      expect(minutes).not.toBe(0);
    }
  });

  it('weights published hours by PostAnalytics engagement', async () => {
    const base = new Date();
    base.setUTCDate(base.getUTCDate() - 2);
    const makePost = (utcHour: number, engagement: number) => {
      const d = new Date(base);
      d.setUTCHours(utcHour, 15, 0, 0);
      return { publishDate: d, analytics: [{ value: engagement }] };
    };

    // Give 17:00 UTC (same LinkedIn heuristic peak as 08:00) high engagement vs 12:00 UTC
    const published = [
      makePost(17, 5000),
      makePost(17, 4500),
      makePost(12, 10),
    ];
    const svc = new SmartSlotsService(makePrismaMock({ timezone: 'UTC', published }));
    const res = await svc.suggest('org-1', 'int-1', 'linkedin', 3);
    const hours = res.map((r) => new Date(r.datetime).getUTCHours());
    expect(hours[0]).toBe(17);
  });

  it('respects SMART_SLOTS_ACTIVE_HOURS host window', async () => {
    process.env.SMART_SLOTS_ACTIVE_HOURS = '10-14';
    const svc = new SmartSlotsService(makePrismaMock({ timezone: 'UTC' }));
    const res = await svc.suggest('org-1', 'int-1', 'linkedin', 3);
    expect(res.length).toBeGreaterThan(0);
    for (const item of res) {
      const hostHour = new Date(item.datetime).getHours();
      expect(hostHour).toBeGreaterThanOrEqual(10);
      expect(hostHour).toBeLessThanOrEqual(14);
    }
  });
});
