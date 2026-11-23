import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import { MediaService } from '@postsider/nestjs-libraries/database/prisma/media/media.service';
import { probeDimensions } from '@postsider/nestjs-libraries/upload/probe-dimensions';
import { UploadFactory } from '@postsider/nestjs-libraries/upload/upload.factory';

const execFileAsync = promisify(execFile);

export type YoutubeExtractStatus =
  | 'queued'
  | 'downloading'
  | 'transcribing'
  | 'analyzing'
  | 'clipping'
  | 'saving'
  | 'completed'
  | 'failed';

export interface YoutubeExtractClipResult {
  id: string;
  name: string;
  path: string;
  title: string;
  startSec: number;
  endSec: number;
  durationSeconds?: number;
}

export interface YoutubeExtractJob {
  id: string;
  orgId: string;
  url: string;
  status: YoutubeExtractStatus;
  progressMessage: string;
  videoTitle?: string;
  collectionId?: string | null;
  collectionName?: string | null;
  clips: YoutubeExtractClipResult[];
  error?: string;
  createdAt: number;
}

export interface StartYoutubeExtractInput {
  url: string;
  collectionId?: string | null;
  createCollectionFromTitle?: boolean;
  clipCount?: number;
  minDurationSec?: number;
  maxDurationSec?: number;
  aspectRatio?: 'original' | '9:16';
  burnCaptions?: boolean;
}

interface TranscriptCue {
  startSec: number;
  endSec: number;
  text: string;
}

interface ClipSegment {
  startSec: number;
  endSec: number;
  title: string;
}

const JOB_TTL_MS = 2 * 60 * 60 * 1000;

function resolveBinary(candidates: string[], fallback: string): string {
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return fallback;
}

export function isValidYoutubeUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    return (
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'youtu.be'
    );
  } catch {
    return false;
  }
}

function parseTimestampSec(ts: string): number {
  const clean = ts.trim().replace(',', '.');
  const parts = clean.split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

export function parseVttCues(vtt: string): TranscriptCue[] {
  const cues: TranscriptCue[] = [];
  const blocks = vtt.replace(/\r\n/g, '\n').split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const timeLineIdx = lines.findIndex((l) => l.includes('-->'));
    if (timeLineIdx === -1) continue;
    const [startRaw, endRaw] = lines[timeLineIdx].split('-->');
    const startSec = parseTimestampSec(startRaw);
    const endSec = parseTimestampSec((endRaw || '').trim().split(/\s+/)[0]);
    const text = lines
      .slice(timeLineIdx + 1)
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text || endSec <= startSec) continue;
    const prev = cues[cues.length - 1];
    if (prev && prev.text === text) {
      prev.endSec = Math.max(prev.endSec, endSec);
    } else {
      cues.push({ startSec, endSec, text });
    }
  }
  return cues;
}

function formatSrtTime(sec: number): string {
  const clamped = Math.max(0, sec);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = Math.floor(clamped % 60);
  const ms = Math.round((clamped - Math.floor(clamped)) * 1000);
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

function buildClipSrt(
  cues: TranscriptCue[],
  clipStartSec: number,
  clipEndSec: number
): string {
  const overlapping = cues
    .filter((c) => c.endSec > clipStartSec && c.startSec < clipEndSec)
    .map((c, idx) => {
      const start = Math.max(0, c.startSec - clipStartSec);
      const end = Math.max(start + 0.2, Math.min(clipEndSec - clipStartSec, c.endSec - clipStartSec));
      return `${idx + 1}\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\n${c.text}\n`;
    });
  return overlapping.join('\n');
}

function sanitizeFileSlug(input: string, fallback: string): string {
  const clean = input
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return clean || fallback;
}

export function buildEvenFallbackSegments(
  totalDurationSec: number,
  clipCount: number,
  minDurationSec: number,
  maxDurationSec: number
): ClipSegment[] {
  const dur = Math.max(1, Math.floor(totalDurationSec));
  if (dur <= maxDurationSec) {
    return [{ startSec: 0, endSec: dur, title: 'Clip 1' }];
  }
  const targetLen = Math.min(maxDurationSec, Math.max(minDurationSec, 45));
  const maxPossible = Math.max(1, Math.floor(dur / targetLen));
  const count = Math.min(clipCount, maxPossible);
  const step = dur / count;
  const segments: ClipSegment[] = [];
  for (let i = 0; i < count; i++) {
    const startSec = Math.floor(i * step);
    const endSec = Math.min(dur, startSec + targetLen);
    if (endSec - startSec >= 5) {
      segments.push({ startSec, endSec, title: `Clip ${i + 1}` });
    }
  }
  return segments;
}

@Injectable()
export class YoutubeExtractService {
  private readonly storage = UploadFactory.createStorage();
  private readonly jobs = new Map<string, YoutubeExtractJob>();

  constructor(private readonly _mediaService: MediaService) { }

  startExtractJob(orgId: string, input: StartYoutubeExtractInput): YoutubeExtractJob {
    const url = (input.url || '').trim();
    if (!isValidYoutubeUrl(url)) {
      throw new BadRequestException(
        'Please enter a valid YouTube URL (youtube.com or youtu.be).'
      );
    }

    this.pruneOldJobs();

    const job: YoutubeExtractJob = {
      id: randomUUID(),
      orgId,
      url,
      status: 'queued',
      progressMessage: 'Queued YouTube extraction…',
      clips: [],
      createdAt: Date.now(),
    };
    this.jobs.set(job.id, job);

    void this.runJob(job, {
      url,
      collectionId: input.collectionId ?? null,
      createCollectionFromTitle: input.createCollectionFromTitle ?? !input.collectionId,
      clipCount: Math.max(1, Math.min(8, Number(input.clipCount) || 3)),
      minDurationSec: Math.max(10, Math.min(90, Number(input.minDurationSec) || 20)),
      maxDurationSec: Math.max(15, Math.min(180, Number(input.maxDurationSec) || 60)),
      aspectRatio: input.aspectRatio === '9:16' ? '9:16' : 'original',
      burnCaptions: Boolean(input.burnCaptions),
    });

    return job;
  }

  getJob(orgId: string, jobId: string): YoutubeExtractJob {
    const job = this.jobs.get(jobId);
    if (!job || job.orgId !== orgId) {
      throw new NotFoundException('Extraction job not found');
    }
    return job;
  }

  private pruneOldJobs() {
    const cutoff = Date.now() - JOB_TTL_MS;
    for (const [id, job] of this.jobs.entries()) {
      if (job.createdAt < cutoff) {
        this.jobs.delete(id);
      }
    }
  }

  private async runJob(
    job: YoutubeExtractJob,
    opts: Required<Omit<StartYoutubeExtractInput, 'collectionId'>> & {
      collectionId: string | null;
    }
  ) {
    const ytdlp = resolveBinary(
      ['/opt/homebrew/bin/yt-dlp', '/usr/local/bin/yt-dlp'],
      'yt-dlp'
    );
    const ffmpeg = resolveBinary(
      ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'],
      'ffmpeg'
    );
    const workDir = await mkdtemp(join(tmpdir(), 'anext-yt-'));

    try {
      job.status = 'downloading';
      job.progressMessage = 'Downloading YouTube video…';

      const { stdout } = await execFileAsync(
        ytdlp,
        [
          '--no-playlist',
          '--print-json',
          '-f',
          'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best[ext=mp4]/best',
          '--merge-output-format',
          'mp4',
          '-o',
          join(workDir, 'source.%(ext)s'),
          opts.url,
        ],
        { maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000 }
      );

      // Fetch English VTT subtitles best-effort; never fail video extraction on YouTube subtitle 429s.
      await execFileAsync(
        ytdlp,
        [
          '--no-playlist',
          '--skip-download',
          '--write-auto-sub',
          '--write-sub',
          '--sub-lang',
          'en',
          '--sub-format',
          'vtt',
          '-o',
          join(workDir, 'source.%(ext)s'),
          opts.url,
        ],
        { maxBuffer: 5 * 1024 * 1024, timeout: 60 * 1000 }
      ).catch(() => undefined);

      const metaLine = stdout
        .trim()
        .split('\n')
        .reverse()
        .find((l) => l.startsWith('{'));
      const meta = metaLine ? JSON.parse(metaLine) : {};
      const videoTitle = String(meta?.title || 'YouTube Video').trim();
      const videoDurationSec = Number(meta?.duration) || 0;
      job.videoTitle = videoTitle;

      const files = await readdir(workDir);
      const mp4Name = files.find((f) => f.endsWith('.mp4'));
      if (!mp4Name) {
        throw new Error('yt-dlp did not produce an MP4 video file.');
      }
      const sourceVideoPath = join(workDir, mp4Name);

      // Resolve target collection
      let targetCollectionId = opts.collectionId;
      if (!targetCollectionId && opts.createCollectionFromTitle) {
        const colName = `YT · ${videoTitle}`.slice(0, 60);
        const created = await this._mediaService.createCollection(job.orgId, colName);
        targetCollectionId = created.id;
        job.collectionId = created.id;
        job.collectionName = created.name;
      } else {
        job.collectionId = targetCollectionId;
      }

      // Step 2: Transcript cues (VTT first, OpenAI Whisper fallback)
      job.status = 'transcribing';
      job.progressMessage = 'Reading video transcript…';
      let cues: TranscriptCue[] = [];
      const vttName = files.find((f) => f.endsWith('.vtt'));
      if (vttName) {
        const vttRaw = await readFile(join(workDir, vttName), 'utf8');
        cues = parseVttCues(vttRaw);
      } else if (process.env.OPENAI_API_KEY) {
        job.progressMessage = 'Transcribing audio with Whisper…';
        cues = await this.transcribeWithWhisper(ffmpeg, workDir, sourceVideoPath);
      }

      // Step 3: Highlight detection
      job.status = 'analyzing';
      job.progressMessage = 'Selecting best short-form clips…';
      const probed = await this.probeLocalDuration(sourceVideoPath);
      const totalDurationSec = videoDurationSec || probed || 60;

      let segments = await this.pickHighlightsWithOpenAI(
        videoTitle,
        totalDurationSec,
        cues,
        opts.clipCount,
        opts.minDurationSec,
        opts.maxDurationSec
      );
      if (segments.length === 0) {
        segments = buildEvenFallbackSegments(
          totalDurationSec,
          opts.clipCount,
          opts.minDurationSec,
          opts.maxDurationSec
        );
      }

      // Step 4 & 5: Chop with ffmpeg + upload into Media library
      const createdClips: YoutubeExtractClipResult[] = [];
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        job.status = 'clipping';
        job.progressMessage = `Chopping clip ${i + 1} of ${segments.length}: ${seg.title}`;

        const clipFilename = `clip_${i + 1}.mp4`;
        const clipPath = join(workDir, clipFilename);
        const duration = Math.max(3, seg.endSec - seg.startSec);

        const filters: string[] = [];
        if (opts.aspectRatio === '9:16') {
          filters.push(
            'crop=min(iw\\,ih*9/16):ih:(iw-min(iw\\,ih*9/16))/2:0,scale=720:1280'
          );
        }
        if (opts.burnCaptions && cues.length > 0) {
          const srtContent = buildClipSrt(cues, seg.startSec, seg.endSec);
          if (srtContent.trim()) {
            const srtName = `clip_${i + 1}.srt`;
            await writeFile(join(workDir, srtName), srtContent, 'utf8');
            filters.push(
              `subtitles=${srtName}:force_style='FontSize=18,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,Outline=2,Alignment=2,MarginV=36'`
            );
          }
        }

        const ffArgs = [
          '-y',
          '-ss',
          String(seg.startSec),
          '-t',
          String(duration),
          '-i',
          mp4Name,
          ...(filters.length > 0 ? ['-vf', filters.join(',')] : []),
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '23',
          '-c:a',
          'aac',
          '-movflags',
          '+faststart',
          clipFilename,
        ];

        await execFileAsync(ffmpeg, ffArgs, {
          cwd: workDir,
          maxBuffer: 10 * 1024 * 1024,
          timeout: 5 * 60 * 1000,
        });

        job.status = 'saving';
        job.progressMessage = `Saving clip ${i + 1} of ${segments.length} to Media library…`;

        const buffer = await readFile(clipPath);
        const safeSlug = sanitizeFileSlug(seg.title, `clip-${i + 1}`);
        const uploadName = `${safeSlug}.mp4`;
        const fakeFile = {
          fieldname: 'file',
          originalname: uploadName,
          encoding: '7bit',
          mimetype: 'video/mp4',
          buffer,
          size: buffer.length,
        } as Express.Multer.File;

        const uploaded = await this.storage.uploadFile(fakeFile);
        const { width, height, durationSeconds } = await probeDimensions(fakeFile);
        const saved = await this._mediaService.saveFile(
          job.orgId,
          uploaded.originalname,
          uploaded.path,
          uploadName,
          uploaded.kind,
          buffer.length,
          width,
          height,
          durationSeconds,
          targetCollectionId
        );

        createdClips.push({
          id: saved.id,
          name: saved.originalName || saved.name,
          path: saved.path,
          title: seg.title,
          startSec: seg.startSec,
          endSec: seg.endSec,
          durationSeconds,
        });
      }

      job.clips = createdClips;
      job.status = 'completed';
      job.progressMessage = `Extracted ${createdClips.length} clip${createdClips.length === 1 ? '' : 's'} into Media library.`;
    } catch (err: any) {
      const msg = err?.message || 'YouTube extraction failed';
      job.status = 'failed';
      job.error = msg;
      job.progressMessage = msg;
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async probeLocalDuration(filePath: string): Promise<number> {
    try {
      const buf = await readFile(filePath);
      const { durationSeconds } = await probeDimensions({
        mimetype: 'video/mp4',
        buffer: buf,
      } as Express.Multer.File);
      return durationSeconds || 0;
    } catch {
      return 0;
    }
  }

  private async transcribeWithWhisper(
    ffmpeg: string,
    workDir: string,
    sourceVideoPath: string
  ): Promise<TranscriptCue[]> {
    try {
      const audioPath = join(workDir, 'audio.mp3');
      await execFileAsync(ffmpeg, [
        '-y',
        '-i',
        sourceVideoPath,
        '-vn',
        '-acodec',
        'libmp3lame',
        '-q:a',
        '6',
        audioPath,
      ]);
      const audioBuf = await readFile(audioPath);
      if (audioBuf.length > 24 * 1024 * 1024) return [];

      const form = new FormData();
      form.append('file', new Blob([audioBuf], { type: 'audio/mpeg' }), 'audio.mp3');
      form.append('model', 'whisper-1');
      form.append('response_format', 'verbose_json');

      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: form,
      });
      if (!res.ok) return [];
      const json: any = await res.json();
      return (json.segments || [])
        .map((s: any) => ({
          startSec: Number(s.start) || 0,
          endSec: Number(s.end) || 0,
          text: String(s.text || '').trim(),
        }))
        .filter((c: TranscriptCue) => c.text && c.endSec > c.startSec);
    } catch {
      return [];
    }
  }

  private async pickHighlightsWithOpenAI(
    videoTitle: string,
    totalDurationSec: number,
    cues: TranscriptCue[],
    clipCount: number,
    minDurationSec: number,
    maxDurationSec: number
  ): Promise<ClipSegment[]> {
    if (!process.env.OPENAI_API_KEY || cues.length === 0) return [];
    if (totalDurationSec <= maxDurationSec) {
      return [
        {
          startSec: 0,
          endSec: Math.max(5, Math.floor(totalDurationSec)),
          title: videoTitle.slice(0, 48) || 'Clip 1',
        },
      ];
    }

    try {
      const transcriptText = cues
        .slice(0, 400)
        .map((c) => `[${Math.floor(c.startSec)}s] ${c.text}`)
        .join('\n')
        .slice(0, 14000);

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'You pick high-retention short-form video clips from a timestamped transcript. Return JSON: {"clips":[{"startSec":number,"endSec":number,"title":string}]}. Each clip must be self-contained, between minDurationSec and maxDurationSec seconds, and strictly within [0, totalDurationSec].',
            },
            {
              role: 'user',
              content: JSON.stringify({
                videoTitle,
                totalDurationSec,
                clipCount,
                minDurationSec,
                maxDurationSec,
                transcript: transcriptText,
              }),
            },
          ],
        }),
      });
      if (!res.ok) return [];
      const data: any = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) return [];
      const parsed = JSON.parse(content);
      const rawClips: any[] = Array.isArray(parsed?.clips) ? parsed.clips : [];
      return rawClips
        .slice(0, clipCount)
        .map((c, idx) => {
          const startSec = Math.max(0, Math.floor(Number(c.startSec) || 0));
          const endSec = Math.min(
            Math.floor(totalDurationSec),
            Math.max(startSec + 5, Math.floor(Number(c.endSec) || startSec + 30))
          );
          return {
            startSec,
            endSec,
            title: String(c.title || `Clip ${idx + 1}`).trim().slice(0, 60),
          };
        })
        .filter((c) => c.endSec - c.startSec >= 5);
    } catch {
      return [];
    }
  }
}
