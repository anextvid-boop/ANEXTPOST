import { PrismaRepository } from '@postsider/nestjs-libraries/database/prisma/prisma.service';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SaveMediaInformationDto } from '@postsider/nestjs-libraries/dtos/media/save.media.information.dto';

@Injectable()
export class MediaRepository {
  constructor(
    private _media: PrismaRepository<'media'>,
    private _collection: PrismaRepository<'mediaCollection'>,
    private _post: PrismaRepository<'post'>
  ) {}

  /**
   * All non-deleted media for an organization, reduced to the fields needed
   * for cleanup scanning (id + path).
   */
  listAllForOrg(org: string) {
    return this._media.model.media.findMany({
      where: { organizationId: org, deletedAt: null },
      select: { id: true, path: true },
    });
  }

  /**
   * Content + image blobs of every non-deleted post for the organization.
   * Used to detect which media are still referenced by a post.
   */
  getPostMediaReferences(org: string) {
    return this._post.model.post.findMany({
      where: { organizationId: org, deletedAt: null },
      select: { content: true, image: true },
    });
  }

  async isMediaReferenced(org: string, id: string, path: string) {
    const references = [path, path.split('/').pop(), id].filter(
      (reference): reference is string => !!reference
    );
    const post = await this._post.model.post.findFirst({
      where: {
        organizationId: org,
        deletedAt: null,
        OR: [...new Set(references)].flatMap((reference) => [
          { image: { contains: reference } },
          { content: { contains: reference } },
        ]),
      },
      select: { id: true },
    });
    return !!post;
  }

  /** Soft-delete a specific set of media ids belonging to the organization. */
  softDeleteByIds(org: string, ids: string[]) {
    return this._media.model.media.updateMany({
      where: { organizationId: org, id: { in: ids }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  /** Soft-delete every non-deleted media for the organization. */
  softDeleteAllForOrg(org: string) {
    return this._media.model.media.updateMany({
      where: { organizationId: org, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  async saveFile(
    org: string,
    fileName: string,
    filePath: string,
    originalName?: string,
    type: 'image' | 'video' | 'audio' = 'image',
    fileSize?: number,
    width?: number,
    height?: number,
    durationSeconds?: number,
    collectionId?: string | null,
    options?: {
      thumbnail?: string | null;
      contentHash?: string | null;
      contentCategory?: string;
      sourceType?: string;
    }
  ) {
    let validCollectionId: string | null = null;
    if (collectionId) {
      const col = await this._collection.model.mediaCollection.findFirst({
        where: { id: collectionId, organizationId: org },
        select: { id: true },
      });
      if (col) validCollectionId = col.id;
    }

    return this._media.model.media.create({
      data: {
        organization: {
          connect: {
            id: org,
          },
        },
        ...(validCollectionId
          ? { collection: { connect: { id: validCollectionId } } }
          : {}),
        name: fileName,
        path: filePath,
        originalName: originalName || null,
        type,
        fileSize: fileSize ?? 0,
        width,
        height,
        durationSeconds,
        ...(options?.thumbnail ? { thumbnail: options.thumbnail } : {}),
        ...(options?.contentHash ? { contentHash: options.contentHash } : {}),
        ...(options?.contentCategory
          ? { contentCategory: options.contentCategory }
          : {}),
        ...(options?.sourceType ? { sourceType: options.sourceType } : {}),
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        path: true,
        thumbnail: true,
        alt: true,
        type: true,
        collectionId: true,
        fileSize: true,
        width: true,
        height: true,
        durationSeconds: true,
        contentHash: true,
        contentCategory: true,
        sourceType: true,
        retentionPolicy: true,
        createdAt: true,
      },
    });
  }

  getMediaById(id: string, orgId: string) {
    return this._media.model.media.findFirst({
      where: {
        id,
        organizationId: orgId,
      },
    });
  }

  deleteMedia(org: string, id: string) {
    return this._media.model.media.update({
      where: {
        id,
        organizationId: org,
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  saveMediaInformation(org: string, data: SaveMediaInformationDto) {
    return this._media.model.media.update({
      where: {
        id: data.id,
        organizationId: org,
      },
      data: {
        alt: data.alt,
        thumbnail: data.thumbnail,
        thumbnailTimestamp: data.thumbnailTimestamp,
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        alt: true,
        thumbnail: true,
        path: true,
        thumbnailTimestamp: true,
      },
    });
  }

  async getMedia(
    org: string,
    page: number,
    search?: string,
    collectionId?: string,
    limit = 18,
    type?: string,
    contentCategory?: string
  ) {
    const pageSize = Math.min(Math.max(Number(limit) || 18, 1), 100);
    const pageNum = Math.max((Number(page) || 1) - 1, 0);
    const trimmedSearch = search?.trim();
    const searchFilter = trimmedSearch
      ? {
          OR: [
            {
              originalName: {
                contains: trimmedSearch,
                mode: 'insensitive' as const,
              },
            },
            {
              name: {
                contains: trimmedSearch,
                mode: 'insensitive' as const,
              },
            },
          ],
        }
      : {};
    const collectionFilter =
      collectionId === 'unassigned'
        ? { collectionId: null }
        : collectionId
        ? { collectionId }
        : {};
    const typeFilter =
      type === 'image' || type === 'video' || type === 'audio' ? { type } : {};
    const categoryFilter =
      contentCategory === 'short_form' ||
      contentCategory === 'long_form' ||
      contentCategory === 'standard'
        ? { contentCategory }
        : {};
    const whereClause: any = {
      organizationId: org,
      deletedAt: null,
      ...searchFilter,
      ...collectionFilter,
      ...typeFilter,
      ...categoryFilter,
    };
    const total = await this._media.model.media.count({ where: whereClause });
    const pages = Math.max(Math.ceil(total / pageSize), 1);
    const results = await this._media.model.media.findMany({
      where: whereClause,
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        path: true,
        thumbnail: true,
        alt: true,
        thumbnailTimestamp: true,
        fileSize: true,
        type: true,
        collectionId: true,
        createdAt: true,
        width: true,
        height: true,
        durationSeconds: true,
        contentHash: true,
        contentCategory: true,
        sourceType: true,
        retentionPolicy: true,
        eligibleForDeletionAt: true,
      },
      skip: pageNum * pageSize,
      take: pageSize,
    });

    return {
      pages,
      total,
      page: pageNum + 1,
      limit: pageSize,
      results,
    };
  }

  async getStorageOverview(org: string) {
    const rows = await this._media.model.media.findMany({
      where: { organizationId: org, deletedAt: null, storageDeletedAt: null },
      select: {
        type: true,
        fileSize: true,
        contentCategory: true,
        retentionPolicy: true,
        eligibleForDeletionAt: true,
      },
    });
    let totalImages = 0;
    let totalImageBytes = 0;
    let totalVideos = 0;
    let totalVideoBytes = 0;
    let shortFormCount = 0;
    let shortFormBytes = 0;
    let longFormCount = 0;
    let longFormBytes = 0;
    let awaitingDeletionCount = 0;
    let reclaimableBytes = 0;

    for (const r of rows) {
      const size = Number(r.fileSize) || 0;
      if (r.type === 'video') {
        totalVideos += 1;
        totalVideoBytes += size;
        if (r.contentCategory === 'long_form') {
          longFormCount += 1;
          longFormBytes += size;
        } else {
          shortFormCount += 1;
          shortFormBytes += size;
        }
      } else {
        totalImages += 1;
        totalImageBytes += size;
      }
      if (
        r.retentionPolicy &&
        r.retentionPolicy !== 'keep_permanent' &&
        r.retentionPolicy !== 'manual_only' &&
        r.eligibleForDeletionAt
      ) {
        awaitingDeletionCount += 1;
        reclaimableBytes += size;
      }
    }

    return {
      totalImages,
      totalImageBytes,
      totalVideos,
      totalVideoBytes,
      totalBytes: totalImageBytes + totalVideoBytes,
      shortFormCount,
      shortFormBytes,
      longFormCount,
      longFormBytes,
      awaitingDeletionCount,
      reclaimableBytes,
    };
  }

  async updateMediaMetadata(
    org: string,
    id: string,
    data: {
      contentCategory?: string;
      name?: string;
      alt?: string;
    }
  ) {
    const existing = await this._media.model.media.findFirst({
      where: { id, organizationId: org, deletedAt: null },
      select: { id: true },
    });
    if (!existing) {
      return null;
    }
    return this._media.model.media.update({
      where: { id },
      data: {
        ...(data.contentCategory ? { contentCategory: data.contentCategory } : {}),
        ...(data.name !== undefined ? { originalName: data.name } : {}),
        ...(data.alt !== undefined ? { alt: data.alt } : {}),
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        alt: true,
        contentCategory: true,
        retentionPolicy: true,
      },
    });
  }

  async getMediaDependencies(org: string, id: string) {
    const media = await this._media.model.media.findFirst({
      where: { id, organizationId: org },
      select: { id: true, path: true },
    });
    if (!media) {
      return { blocked: false, count: 0, dependencies: [] };
    }
    const base = media.path?.split('/').pop();
    const activePosts = await this._post.model.post.findMany({
      where: {
        organizationId: org,
        deletedAt: null,
        state: { in: ['DRAFT', 'QUEUE', 'ERROR'] },
      },
      select: {
        id: true,
        state: true,
        publishDate: true,
        content: true,
        image: true,
        integration: {
          select: {
            id: true,
            name: true,
            providerIdentifier: true,
          },
        },
      },
      orderBy: { publishDate: 'asc' },
    });

    const dependencies = activePosts
      .filter((p) => {
        const hay = `${p.content ?? ''}\n${p.image ?? ''}`;
        return (
          (media.id && hay.includes(media.id)) ||
          (media.path && hay.includes(media.path)) ||
          (base ? hay.includes(base) : false)
        );
      })
      .map((p) => ({
        id: p.id,
        state: p.state,
        publishDate: p.publishDate,
        snippet: (p.content || '').replace(/<[^>]+>/g, '').trim().slice(0, 80),
        channelName: p.integration?.name || 'Unknown channel',
        providerIdentifier: p.integration?.providerIdentifier || '',
      }));

    return {
      blocked: dependencies.length > 0,
      count: dependencies.length,
      dependencies,
    };
  }

  async listCollections(org: string) {
    const [collections, mediaRows] = await Promise.all([
      this._collection.model.mediaCollection.findMany({
        where: { organizationId: org },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          name: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this._media.model.media.findMany({
        where: { organizationId: org, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: {
          collectionId: true,
          path: true,
          thumbnail: true,
          type: true,
        },
      }),
    ]);

    const stats = new Map<
      string,
      {
        count: number;
        imageCount: number;
        videoCount: number;
        coverPath: string | null;
        coverType: string | null;
      }
    >();
    let totalImageCount = 0;
    let totalVideoCount = 0;
    let unassignedCount = 0;
    let unassignedImageCount = 0;
    let unassignedVideoCount = 0;
    let unassignedCoverPath: string | null = null;
    let unassignedCoverType: string | null = null;
    let allCoverPath: string | null = null;
    let allCoverType: string | null = null;

    for (const row of mediaRows) {
      const cover = row.thumbnail || row.path;
      const isVideo = row.type === 'video';
      if (isVideo) totalVideoCount += 1;
      else totalImageCount += 1;

      if (!allCoverPath) {
        allCoverPath = cover;
        allCoverType = row.type;
      }
      if (!row.collectionId) {
        unassignedCount += 1;
        if (isVideo) unassignedVideoCount += 1;
        else unassignedImageCount += 1;
        if (!unassignedCoverPath) {
          unassignedCoverPath = cover;
          unassignedCoverType = row.type;
        }
        continue;
      }
      const existing = stats.get(row.collectionId);
      if (!existing) {
        stats.set(row.collectionId, {
          count: 1,
          imageCount: isVideo ? 0 : 1,
          videoCount: isVideo ? 1 : 0,
          coverPath: cover,
          coverType: row.type,
        });
      } else {
        existing.count += 1;
        if (isVideo) existing.videoCount += 1;
        else existing.imageCount += 1;
      }
    }

    return {
      totalCount: mediaRows.length,
      totalImageCount,
      totalVideoCount,
      allCoverPath,
      allCoverType,
      unassignedCount,
      unassignedImageCount,
      unassignedVideoCount,
      unassignedCoverPath,
      unassignedCoverType,
      collections: collections.map((c) => {
        const s = stats.get(c.id);
        return {
          ...c,
          count: s?.count ?? 0,
          imageCount: s?.imageCount ?? 0,
          videoCount: s?.videoCount ?? 0,
          coverPath: s?.coverPath ?? null,
          coverType: s?.coverType ?? null,
        };
      }),
    };
  }

  async createCollection(org: string, rawName: string) {
    const name = (rawName || '').trim();
    if (!name) {
      throw new BadRequestException('Collection name is required');
    }
    const existing = await this._collection.model.mediaCollection.findFirst({
      where: { organizationId: org, name },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(`Collection "${name}" already exists`);
    }
    return this._collection.model.mediaCollection.create({
      data: { organizationId: org, name },
    });
  }

  async renameCollection(org: string, id: string, rawName: string) {
    const name = (rawName || '').trim();
    if (!name) {
      throw new BadRequestException('Collection name is required');
    }
    const current = await this._collection.model.mediaCollection.findFirst({
      where: { id, organizationId: org },
      select: { id: true },
    });
    if (!current) {
      throw new NotFoundException('Collection not found');
    }
    const duplicate = await this._collection.model.mediaCollection.findFirst({
      where: { organizationId: org, name, NOT: { id } },
      select: { id: true },
    });
    if (duplicate) {
      throw new BadRequestException(`Collection "${name}" already exists`);
    }
    return this._collection.model.mediaCollection.update({
      where: { id },
      data: { name },
    });
  }

  async deleteCollection(org: string, id: string) {
    const current = await this._collection.model.mediaCollection.findFirst({
      where: { id, organizationId: org },
      select: { id: true },
    });
    if (!current) {
      throw new NotFoundException('Collection not found');
    }
    // Media.collectionId uses onDelete: SetNull, returning assets to Unassigned
    // without deleting files or altering Post.image attachments.
    await this._collection.model.mediaCollection.delete({
      where: { id },
    });
    return { ok: true };
  }

  async moveMediaToCollection(
    org: string,
    mediaIds: string[],
    collectionId: string | null,
    onlyIfUnassigned = false
  ) {
    if (!Array.isArray(mediaIds) || mediaIds.length === 0) {
      return { updated: 0 };
    }
    if (collectionId) {
      const col = await this._collection.model.mediaCollection.findFirst({
        where: { id: collectionId, organizationId: org },
        select: { id: true },
      });
      if (!col) {
        throw new NotFoundException('Target collection not found');
      }
    }
    const res = await this._media.model.media.updateMany({
      where: {
        organizationId: org,
        deletedAt: null,
        id: { in: mediaIds },
        ...(onlyIfUnassigned ? { collectionId: null } : {}),
      },
      data: { collectionId: collectionId || null },
    });
    return { updated: res.count };
  }
}
