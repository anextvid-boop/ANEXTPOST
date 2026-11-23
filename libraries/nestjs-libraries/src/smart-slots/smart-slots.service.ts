import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@postsider/nestjs-libraries/database/prisma/prisma.service';
import { scoreSlots, RankedSlot } from './smart-slots.scoring';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
dayjs.extend(utc);
dayjs.extend(timezone);

// A fairly dense candidate grid so the gradient heuristic + diversifier have room
// to find good, spread-out slots (not just a handful of fixed hours).
const CANDIDATE_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
const DAYS_AHEAD = 14;
const LEAD_MS = 30 * 60_000; // never suggest a slot less than 30 min out
const COLLISION_MS = 45 * 60_000; // keep suggestions clear of already-queued posts
const HISTORY_DAYS = 90;
const MIN_HISTORY = 3; // personalize early for newly connected established accounts
const SPREAD_MS = 3 * 3_600_000; // suggestions at least 3h apart
const DAY_MS = 86_400_000;
const JITTER_MINUTES = [7, 13, 19, 27, 34, 42, 49, 53];

function resolveDefaultTimezone(): string {
  const configured = process.env.SMART_SLOTS_DEFAULT_TIMEZONE?.trim();
  if (configured) return configured;
  try {
    const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (localTz) return localTz;
  } catch {
    // ignore
  }
  return 'UTC';
}

function deterministicMinute(integrationId: string, dayOffset: number, hour: number): number {
  let hash = dayOffset * 31 + hour * 17;
  for (let i = 0; i < integrationId.length; i++) {
    hash = (hash * 31 + integrationId.charCodeAt(i)) >>> 0;
  }
  return JITTER_MINUTES[hash % JITTER_MINUTES.length];
}

function parseActiveHoursWindow(): { start: number; end: number } | null {
  const raw = process.env.SMART_SLOTS_ACTIVE_HOURS?.trim();
  if (!raw) return null;
  const match = /^(\d{1,2})\s*-\s*(\d{1,2})$/.exec(raw);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    start > 23 ||
    end < 0 ||
    end > 23
  ) {
    return null;
  }
  return { start, end };
}

function isWithinHostActiveWindow(utcMs: number, window: { start: number; end: number } | null): boolean {
  if (!window) return true;
  const hostHour = new Date(utcMs).getHours();
  if (window.start <= window.end) {
    return hostHour >= window.start && hostHour <= window.end;
  }
  return hostHour >= window.start || hostHour <= window.end;
}

@Injectable()
export class SmartSlotsService {
  constructor(private _prisma: PrismaService) {}

  /**
   * Suggest the best future posting times for a channel.
   *
   * Ranking blends three real signals:
   *  1. a per-platform, audience-local peak-hour heuristic (smart-slots.heuristics),
   *  2. the channel's OWN posting rhythm — a histogram of the hours its past
   *     PUBLISHED posts went out (only when there are enough to be meaningful),
   *  3. collision avoidance — candidates within COLLISION_MS of an already-queued
   *     post are dropped so we never suggest a time you're already posting.
   * Results are diversified (at most one per local day, ≥3h apart) so you get a
   * spread of options instead of a cluster.
   *
   * The audience-local zone is the CHANNEL's own configured Integration.timezone
   * (default 'UTC'), never the viewing staff member's browser — an agency
   * operator in one timezone reviewing a client channel based in another used
   * to get suggestions ranked for their own local clock, not the audience's.
   * tzOffsetMinutes here is that channel's current UTC offset, resolved once
   * per call — a flat offset across the ~14-day candidate window is a rare,
   * low-severity imprecision only on the handful of days each year a DST
   * transition falls inside that window (advisory ranking only; the actual
   * scheduled instant is resolved separately, DST-correctly, by
   * PostsService.findFreeDateTime).
   * NOTE: engagement-based optimization would require persisting post analytics
   * over time; the clickHistogram path is ready for that when it exists.
   */
  async suggest(
    orgId: string,
    integrationId: string,
    platform: string,
    count = 3,
  ): Promise<{ datetime: string; score: number }[]> {
    const integration = await this._prisma.integration.findFirst({
      where: { id: integrationId, organizationId: orgId, deletedAt: null },
      select: { timezone: true, providerIdentifier: true, disabled: true },
    });
    if (!integration) throw new BadRequestException('Integration not found');
    if (integration.disabled) throw new BadRequestException('Integration is disabled');
    if (integration.providerIdentifier !== platform) {
      throw new BadRequestException('Platform does not match integration');
    }
    const tz = integration.timezone || resolveDefaultTimezone();
    const tzOffsetMinutes = dayjs().tz(tz).utcOffset();
    const offsetMs = tzOffsetMinutes * 60_000;
    const nowMs = Date.now();
    const localNow = new Date(nowMs + offsetMs);
    const activeWindow = parseActiveHoursWindow();

    // 1) Candidate grid in audience-local time, future-only (with a small lead)
    //    and deterministic minute jitter to avoid top-of-hour (:00) feed spikes.
    const allCandidates: Date[] = [];
    for (let d = 0; d < DAYS_AHEAD; d++) {
      for (const h of CANDIDATE_HOURS) {
        const minute = deterministicMinute(integrationId, d, h);
        const localMs = Date.UTC(
          localNow.getUTCFullYear(),
          localNow.getUTCMonth(),
          localNow.getUTCDate() + d,
          h,
          minute,
          0,
          0,
        );
        const utcMs = localMs - offsetMs;
        if (utcMs > nowMs + LEAD_MS) allCandidates.push(new Date(utcMs));
      }
    }
    const awakeCandidates = allCandidates.filter((c) => isWithinHostActiveWindow(c.getTime(), activeWindow));
    const candidates = awakeCandidates.length > 0 ? awakeCandidates : allCandidates;

    // 2) Pull the channel's own posts: queued (for collision avoidance) and
    // recently published with analytics (for engagement-weighted rhythm).
    const [scheduled, published] = await Promise.all([
      this._prisma.post
        .findMany({
          where: {
            integrationId,
            state: 'QUEUE',
            publishDate: { gte: new Date(nowMs), lte: new Date(nowMs + DAYS_AHEAD * DAY_MS) },
          },
          select: { publishDate: true },
        })
        .catch(() => [] as { publishDate: Date }[]),
      this._prisma.post
        .findMany({
          where: {
            integrationId,
            state: 'PUBLISHED',
            publishDate: { gte: new Date(nowMs - HISTORY_DAYS * DAY_MS) },
          },
          select: {
            publishDate: true,
            analytics: { select: { value: true } },
          },
          take: 500,
        })
        .catch(() => [] as { publishDate: Date; analytics?: { value: number }[] }[]),
    ]);

    const busy = scheduled.map((p) => p.publishDate.getTime());
    const free = candidates.filter(
      (c) => !busy.some((b) => Math.abs(c.getTime() - b) < COLLISION_MS),
    );

    // Engagement-weighted posting rhythm by local day and hour.
    let histogram: number[] | null = null;
    let postingPattern: number[] | null = null;
    if (published.length >= MIN_HISTORY) {
      const h = new Array(24).fill(0);
      const pattern = new Array(7 * 24).fill(0);
      for (const p of published) {
        const local = new Date(p.publishDate.getTime() + offsetMs);
        const hour = local.getUTCHours();
        const engagementSum = (p.analytics ?? []).reduce(
          (sum, row) => sum + (Number.isFinite(row.value) && row.value > 0 ? row.value : 0),
          0,
        );
        const weight = 1 + Math.log1p(engagementSum);
        h[hour] += weight;
        pattern[local.getUTCDay() * 24 + hour] += weight;
      }
      histogram = h;
      postingPattern = pattern;
    }

    // 3) Score the collision-free candidates, then diversify down to `count`.
    // Prefer free slots even if fewer than `count` remain (returning fewer
    // suggestions beats double-booking a queued slot); only when EVERY candidate
    // collides — a fully-saturated channel — fall back to the full grid.
    // Never recommend a time that is already occupied. An empty result is
    // safer than silently creating a double-booking for an agency client.
    if (!free.length) return [];
    const pool = free;
    const ranked = scoreSlots(
      pool, platform, histogram, pool.length, tzOffsetMinutes, postingPattern,
    );
    const picked = this.diversify(ranked, count, offsetMs);

    return picked.map((s) => ({ datetime: s.datetime.toISOString(), score: s.score }));
  }

  /**
   * Greedy spread: take the highest-scored slots, but at most one per local
   * calendar day and never two within SPREAD_MS. If the per-day cap can't fill
   * `count` (e.g. count > distinct days available), relax it in a second pass.
   */
  private diversify(ranked: RankedSlot[], count: number, offsetMs: number): RankedSlot[] {
    const out: RankedSlot[] = [];
    const usedDays = new Set<string>();
    const localDay = (d: Date) => new Date(d.getTime() + offsetMs).toISOString().slice(0, 10);

    for (const enforceOnePerDay of [true, false]) {
      for (const slot of ranked) {
        if (out.length >= count) break;
        if (out.includes(slot)) continue;
        if (out.some((o) => Math.abs(o.datetime.getTime() - slot.datetime.getTime()) < SPREAD_MS)) {
          continue;
        }
        if (enforceOnePerDay && usedDays.has(localDay(slot.datetime))) continue;
        out.push(slot);
        usedDays.add(localDay(slot.datetime));
      }
      if (out.length >= count) break;
    }
    return out.slice(0, count);
  }
}
