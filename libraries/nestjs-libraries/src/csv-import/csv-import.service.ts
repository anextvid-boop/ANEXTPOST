import { BadRequestException, Injectable } from '@nestjs/common';
import { PostsService } from '@postsider/nestjs-libraries/database/prisma/posts/posts.service';
import { IntegrationService } from '@postsider/nestjs-libraries/database/prisma/integrations/integration.service';
import { parseCSV, rowsToRecords } from './csv.parser';
import {
  CsvRowSchema,
  REQUIRED_COLUMNS,
  parseDateTime,
  resolveChannels,
  splitThread,
} from './csv.validator';

export interface CsvMediaRef {
  id: string;
  path: string;
}

export interface CsvImportResult {
  row: number;
  ok: boolean;
  channels?: string;
  scheduledFor?: string;
  created?: number;
  mediaCount?: number;
  error?: string;
}

@Injectable()
export class CsvImportService {
  // Idempotency cache keyed by `${orgId}:${batchId}:${rowNumber}` so retries
  // after a dropped/missed HTTP response return the already-created result
  // without creating duplicate posts.
  private readonly _processedBatches = new Map<
    string,
    { result: CsvImportResult; expiresAt: number }
  >();

  constructor(
    private _posts: PostsService,
    private _integrations: IntegrationService
  ) {}

  private getCachedRow(key: string): CsvImportResult | undefined {
    const hit = this._processedBatches.get(key);
    if (!hit) return undefined;
    if (Date.now() > hit.expiresAt) {
      this._processedBatches.delete(key);
      return undefined;
    }
    return hit.result;
  }

  private setCachedRow(key: string, result: CsvImportResult): void {
    // Prune expired entries occasionally to bound memory.
    if (this._processedBatches.size > 5000) {
      const now = Date.now();
      for (const [k, v] of this._processedBatches) {
        if (now > v.expiresAt) this._processedBatches.delete(k);
      }
    }
    this._processedBatches.set(key, {
      result,
      expiresAt: Date.now() + 60 * 60 * 1000,
    });
  }

  async importCSV(
    orgId: string,
    buffer: Buffer,
    asDraft = false,
    mediaByRow?: Record<number, CsvMediaRef[]>,
    retryRows?: number[],
    batchId?: string
  ): Promise<CsvImportResult[]> {
    const rows = parseCSV(buffer.toString('utf-8'));
    const { headers, records } = rowsToRecords(rows);

    if (records.length === 0) {
      throw new BadRequestException('The CSV file has no data rows.');
    }
    const missingCols = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
    if (missingCols.length) {
      throw new BadRequestException(
        `Missing required columns: ${missingCols.join(', ')}.`
      );
    }

    const integrations = (
      await this._integrations.getIntegrationsList(orgId)
    )
      .filter((i: any) => !i.disabled && !i.deletedAt)
      .map((i: any) => ({ id: i.id, name: i.name }));

    const results: CsvImportResult[] = [];
    const retryFilter = retryRows?.length ? new Set(retryRows) : null;
    let existingTagsCache: Array<{ id: string; name: string; color: string }> | null =
      null;

    const resolveBatchTag = async (
      labelRaw: string,
      colorRaw: string
    ): Promise<Array<{ value: string; label: string }>> => {
      const label = labelRaw.trim();
      if (!label) return [];
      if (!existingTagsCache) {
        const loaded = (await this._posts.getTags(orgId)) as Array<{
          id: string;
          name: string;
          color: string;
        }>;
        existingTagsCache = Array.isArray(loaded) ? [...loaded] : [];
      }
      const existing = existingTagsCache.find(
        (t) => t.name.toLowerCase() === label.toLowerCase()
      );
      if (existing) {
        return [{ value: existing.id, label: existing.name }];
      }
      const color = /^#[0-9a-fA-F]{3,8}$/.test(colorRaw.trim())
        ? colorRaw.trim()
        : '#2563EB';
      const created = (await this._posts.createTag(orgId, {
        name: label,
        color,
      })) as { id: string; name: string; color: string };
      existingTagsCache.push(created);
      return [{ value: created.id, label: created.name }];
    };

    for (let idx = 0; idx < records.length; idx++) {
      const rowNumber = idx + 2; // +1 header, +1 to 1-base
      if (retryFilter && !retryFilter.has(rowNumber)) {
        continue;
      }
      const batchKey = batchId ? `${orgId}:${batchId}:${rowNumber}` : null;
      if (batchKey) {
        const cached = this.getCachedRow(batchKey);
        if (cached) {
          results.push(cached);
          continue;
        }
      }
      try {
        const parsed = CsvRowSchema.safeParse(records[idx]);
        if (!parsed.success) {
          results.push({
            row: rowNumber,
            ok: false,
            error: parsed.error.issues.map((e) => e.message).join('; '),
          });
          continue;
        }
        const data = parsed.data;

        const { matched, missing } = resolveChannels(data.channels, integrations);
        if (missing.length) {
          results.push({
            row: rowNumber,
            ok: false,
            channels: data.channels,
            error: `No connected channel matched: ${missing.join(', ')}`,
          });
          continue;
        }

        // Resolve the schedule datetime. Blank -> next free queue slot for the
        // first matched channel (depends on PostsService.findFreeDateTime).
        let date: string;
        if (data.datetime) {
          const parsedDate = parseDateTime(data.datetime);
          if (!parsedDate) {
            results.push({
              row: rowNumber,
              ok: false,
              error: `Invalid datetime "${data.datetime}" (use YYYY-MM-DD HH:mm, UTC).`,
            });
            continue;
          }
          // CSV datetimes are interpreted as UTC (the public API contract).
          date = parsedDate + 'Z';
          if (!asDraft && new Date(date).getTime() < Date.now()) {
            results.push({
              row: rowNumber,
              ok: false,
              error: `Datetime "${data.datetime}" is in the past (UTC).`,
            });
            continue;
          }
        } else {
          // Next free queue slot (UTC wall-clock); mark it UTC like Evergreen.
          date = (await this._posts.findFreeDateTime(orgId, matched[0].id)) + 'Z';
        }

        const rowMedia = mediaByRow?.[rowNumber] ?? [];
        if (data.media_path.trim() && rowMedia.length === 0) {
          results.push({
            row: rowNumber,
            ok: false,
            channels: data.channels,
            error:
              'Row specifies media_path but no uploaded media was provided; attach the media folder before importing.',
          });
          continue;
        }
        const hasVideoMedia = rowMedia.some((m) =>
          /\.(mp4|webm|mov)(\?|$)/i.test(m.path)
        );
        if (hasVideoMedia && rowMedia.length > 1) {
          results.push({
            row: rowNumber,
            ok: false,
            channels: data.channels,
            error:
              'A post can attach at most 1 video and cannot combine video with images.',
          });
          continue;
        }

        const threadParts = splitThread(data.thread);
        const value = [
          { content: data.content, image: rowMedia },
          ...threadParts.map((p) => ({ content: p, image: [] })),
        ];

        const resolvedTags = await resolveBatchTag(
          data.batch_label || '',
          data.batch_color || ''
        );

        const dto: any = {
          // Opt-in: land as DRAFT so the batch can go through the (still
          // fully optional) approval flow instead of publishing unreviewed.
          type: asDraft ? 'draft' : 'schedule',
          shortLink: false,
          date,
          tags: resolvedTags,
          posts: matched.map((m) => ({
            integration: { id: m.id },
            value,
            settings: {},
            ...(data.first_comment
              ? { firstComment: data.first_comment }
              : {}),
          })),
        };

        const mapped = await this._posts.mapTypeToPost(dto, orgId);
        const created = await this._posts.createPost(orgId, mapped, 'CSV' as any);

        const rowResult: CsvImportResult = {
          row: rowNumber,
          ok: true,
          channels: matched.map((m) => m.name).join(', '),
          scheduledFor: date,
          created: created?.length ?? 0,
          mediaCount: rowMedia.length,
        };
        if (batchKey) {
          this.setCachedRow(batchKey, rowResult);
        }
        results.push(rowResult);
      } catch (err) {
        results.push({
          row: rowNumber,
          ok: false,
          error: err instanceof Error ? err.message : 'Row failed',
        });
      }
    }

    return results;
  }
}
