import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Logger,
  Optional,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { open, readFile, stat, unlink } from 'fs/promises';
import { randomBytes } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import { Request, Response } from 'express';
import { GetOrgFromRequest } from '@postsider/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@postsider/nestjs-libraries/user/user.from.request';
import { Organization, User } from '@prisma/client';
import { MediaService } from '@postsider/nestjs-libraries/database/prisma/media/media.service';
import { ApiTags } from '@nestjs/swagger';
import handleR2Upload from '@postsider/nestjs-libraries/upload/r2.uploader';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  UPLOAD_MAX_LONGFORM_VIDEO_MB,
  uploadInterceptorOptions,
  videoStreamInterceptorOptions,
} from '@postsider/nestjs-libraries/upload/upload.limits';
import { CustomFileValidationPipe } from '@postsider/nestjs-libraries/upload/custom.upload.validation';
import {
  captureVideoThumbnail,
  computeFileSha256,
  probeDimensions,
  probeVideoPath,
} from '@postsider/nestjs-libraries/upload/probe-dimensions';
import { detectFileType } from '@postsider/nestjs-libraries/upload/detect-file-type';
import { ALLOWED_MIME } from '@postsider/nestjs-libraries/upload/mime.types';
import { SubscriptionService } from '@postsider/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { isBillingEnabled } from '@postsider/nestjs-libraries/services/billing.flag';
import { UploadFactory } from '@postsider/nestjs-libraries/upload/upload.factory';
import { SaveMediaInformationDto } from '@postsider/nestjs-libraries/dtos/media/save.media.information.dto';
import {
  StartYoutubeExtractInput,
  YoutubeExtractService,
} from '@postsider/backend/services/youtube-extract.service';

@ApiTags('Media')
@Controller('/media')
export class MediaController {
  private readonly _logger = new Logger(MediaController.name);
  private storage = UploadFactory.createStorage();
  constructor(
    private _mediaService: MediaService,
    private _subscriptionService: SubscriptionService,
    @Optional() private _youtubeExtractService?: YoutubeExtractService
  ) {}

  @Get('/collections')
  listCollections(@GetOrgFromRequest() org: Organization) {
    return this._mediaService.listCollections(org.id);
  }

  @Post('/collections')
  createCollection(
    @GetOrgFromRequest() org: Organization,
    @Body('name') name: string
  ) {
    return this._mediaService.createCollection(org.id, name);
  }

  @Post('/collections/move')
  moveMediaToCollection(
    @GetOrgFromRequest() org: Organization,
    @Body()
    body: {
      mediaIds: string[];
      collectionId?: string | null;
      onlyIfUnassigned?: boolean;
    }
  ) {
    if (!body || !Array.isArray(body.mediaIds)) {
      throw new BadRequestException('mediaIds must be an array');
    }
    return this._mediaService.moveMediaToCollection(
      org.id,
      body.mediaIds,
      body.collectionId ?? null,
      Boolean(body.onlyIfUnassigned)
    );
  }

  @Patch('/collections/:id')
  renameCollection(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body('name') name: string
  ) {
    return this._mediaService.renameCollection(org.id, id, name);
  }

  @Delete('/collections/:id')
  deleteCollection(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._mediaService.deleteCollection(org.id, id);
  }

  @Get('/storage-overview')
  getStorageOverview(@GetOrgFromRequest() org: Organization) {
    return this._mediaService.getStorageOverview(org.id);
  }

  @Get('/:id/dependencies')
  getMediaDependencies(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._mediaService.getMediaDependencies(org.id, id);
  }

  @Patch('/:id/metadata')
  updateMediaMetadata(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body()
    body: {
      contentCategory?: 'short_form' | 'long_form' | 'standard';
      name?: string;
      alt?: string;
    }
  ) {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Metadata payload is required');
    }
    if (
      body.contentCategory !== undefined &&
      !['short_form', 'long_form', 'standard'].includes(body.contentCategory)
    ) {
      throw new BadRequestException('Invalid contentCategory');
    }
    return this._mediaService.updateMediaMetadata(org.id, id, body);
  }

  @Delete('/:id')
  deleteMedia(@GetOrgFromRequest() org: Organization, @Param('id') id: string) {
    return this._mediaService.deleteMedia(org.id, id);
  }

  /**
   * Delete all media not referenced by any post. Superadmin-only, mirroring the
   * gating on the storage settings page. Destructive — the UI requires a typed
   * confirmation before calling.
   */
  @Post('/cleanup/unused')
  cleanupUnused(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User
  ) {
    if (!user.isSuperAdmin) {
      throw new HttpException('Not available in managed mode', 403);
    }
    return this._mediaService.deleteUnusedMedia(org.id);
  }

  /** Permanently clear the entire media library. Superadmin-only. */
  @Post('/cleanup/all')
  cleanupAll(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User
  ) {
    if (!user.isSuperAdmin) {
      throw new HttpException('Not available in managed mode', 403);
    }
    return this._mediaService.deleteAllMedia(org.id);
  }

  @Post('/upload-server')
  @UseInterceptors(FileInterceptor('file', uploadInterceptorOptions))
  @UsePipes(new CustomFileValidationPipe())
  async uploadServer(
    @GetOrgFromRequest() org: Organization,
    @UploadedFile() file: Express.Multer.File
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded.');
    }
    const originalName = file.originalname || '';
    const uploadedFile = await this.storage.uploadFile(file);
    const { width, height, durationSeconds } = await probeDimensions(file);
    return this._mediaService.saveFile(
      org.id,
      uploadedFile.originalname,
      uploadedFile.path,
      originalName,
      uploadedFile.kind,
      file?.size,
      width,
      height,
      durationSeconds
    );
  }

  @Post('/information')
  saveMediaInformation(
    @GetOrgFromRequest() org: Organization,
    @Body() body: SaveMediaInformationDto
  ) {
    return this._mediaService.saveMediaInformation(org.id, body);
  }

  @Post('/upload-simple')
  @UseInterceptors(FileInterceptor('file', uploadInterceptorOptions))
  @UsePipes(new CustomFileValidationPipe())
  async uploadSimple(
    @GetOrgFromRequest() org: Organization,
    @UploadedFile('file') file: Express.Multer.File,
    @Query('collectionId') collectionId?: string
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded.');
    }
    const originalName = file.originalname;
    const getFile = await this.storage.uploadFile(file);

    const { width, height, durationSeconds } = await probeDimensions(file);
    return this._mediaService.saveFile(
      org.id,
      getFile.originalname,
      getFile.path,
      originalName,
      getFile.kind,
      file.size,
      width,
      height,
      durationSeconds,
      collectionId || null
    );
  }

  @Post('/youtube-extract')
  startYoutubeExtract(
    @GetOrgFromRequest() org: Organization,
    @Body() body: StartYoutubeExtractInput
  ) {
    if (!this._youtubeExtractService) {
      throw new HttpException('YouTube extract service unavailable', 503);
    }
    return this._youtubeExtractService.startExtractJob(org.id, body);
  }

  @Post('/upload-video-stream')
  @UseInterceptors(FileInterceptor('file', videoStreamInterceptorOptions))
  async uploadVideoStream(
    @GetOrgFromRequest() org: Organization,
    @UploadedFile() file: Express.Multer.File,
    @Query('collectionId') collectionId?: string,
    @Query('contentCategory') requestedCategory?: string
  ) {
    if (!file?.path) {
      throw new BadRequestException('No video file uploaded.');
    }
    const tmpThumbPath = join(
      tmpdir(),
      `thumb-${randomBytes(8).toString('hex')}.jpg`
    );
    try {
      const fh = await open(file.path, 'r');
      const header = Buffer.alloc(4100);
      let bytesRead = 0;
      try {
        const res = await fh.read(header, 0, header.length, 0);
        bytesRead = res.bytesRead;
      } finally {
        await fh.close();
      }
      const detected = await detectFileType(header.subarray(0, bytesRead));
      if (
        !detected ||
        !ALLOWED_MIME.has(detected.mime) ||
        !detected.mime.startsWith('video/')
      ) {
        throw new BadRequestException(
          `Unsupported video format. Allowed: MP4, WebM, MOV (max ${UPLOAD_MAX_LONGFORM_VIDEO_MB} MB).`
        );
      }

      const fileStat = await stat(file.path);
      const [contentHash, probed, thumbOk] = await Promise.all([
        computeFileSha256(file.path),
        probeVideoPath(file.path),
        captureVideoThumbnail(file.path, tmpThumbPath),
      ]);

      let thumbnailUrl: string | null = null;
      if (thumbOk) {
        try {
          if (this.storage.uploadFromPath) {
            const thumbUp = await this.storage.uploadFromPath(
              tmpThumbPath,
              'image/jpeg',
              'jpg'
            );
            thumbnailUrl = thumbUp.path;
          } else {
            const thumbBuf = await readFile(tmpThumbPath);
            const thumbUp = await this.storage.uploadFile({
              ...file,
              buffer: thumbBuf,
              mimetype: 'image/jpeg',
              originalname: 'thumb.jpg',
              size: thumbBuf.length,
            });
            thumbnailUrl = thumbUp.path;
          }
        } catch (err) {
          this._logger.warn(
            `Failed to upload video thumbnail for ${file.originalname || 'video'}: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
          thumbnailUrl = null;
        }
      }

      const uploaded = this.storage.uploadFromPath
        ? await this.storage.uploadFromPath(
            file.path,
            detected.mime,
            detected.ext
          )
        : await this.storage.uploadFile({
            ...file,
            buffer: await readFile(file.path),
            mimetype: detected.mime,
          });

      const resolvedCategory =
        requestedCategory === 'short_form' || requestedCategory === 'long_form'
          ? requestedCategory
          : (probed.durationSeconds ?? 0) >= 90 ||
            (probed.width && probed.height && probed.width > probed.height)
          ? 'long_form'
          : 'short_form';

      const safeOriginalName = (file.originalname || 'video')
        .replace(/[\\/]/g, '_')
        .slice(0, 180);

      return await this._mediaService.saveFile(
        org.id,
        uploaded.originalname,
        uploaded.path,
        safeOriginalName,
        'video',
        fileStat.size,
        probed.width,
        probed.height,
        probed.durationSeconds,
        collectionId || null,
        {
          thumbnail: thumbnailUrl,
          contentHash,
          contentCategory: resolvedCategory,
          sourceType: 'upload',
        }
      );
    } finally {
      await unlink(file.path).catch(() => {});
      await unlink(tmpThumbPath).catch(() => {});
    }
  }

  @Get('/youtube-extract/:jobId')
  getYoutubeExtractJob(
    @GetOrgFromRequest() org: Organization,
    @Param('jobId') jobId: string
  ) {
    if (!this._youtubeExtractService) {
      throw new HttpException('YouTube extract service unavailable', 503);
    }
    return this._youtubeExtractService.getJob(org.id, jobId);
  }

  @Post('/:endpoint')
  async uploadFile(
    @GetOrgFromRequest() org: Organization,
    @Req() req: Request,
    @Res() res: Response,
    @Param('endpoint') endpoint: string
  ) {
    return handleR2Upload(endpoint, req, res, async (upload) => {
      const saved = await this._mediaService.saveFile(
        org.id,
        upload.key,
        upload.location,
        upload.originalName,
        upload.type,
        upload.size
      );
      return { ...upload.response, saved };
    });
  }

  @Get('/')
  getMedia(
    @GetOrgFromRequest() org: Organization,
    @Query('page') page: number,
    @Query('search') search?: string,
    @Query('collectionId') collectionId?: string,
    @Query('limit') limit?: number,
    @Query('type') type?: string,
    @Query('contentCategory') contentCategory?: string
  ) {
    return this._mediaService.getMedia(
      org.id,
      page,
      search,
      collectionId,
      limit,
      type,
      contentCategory
    );
  }
}
