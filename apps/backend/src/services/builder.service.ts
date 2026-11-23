import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@postsider/nestjs-libraries/database/prisma/prisma.service';
import {
  ANEXTVID_SAMPLE_BATCH,
  ANEXTVID_SAMPLE_COLLECTIONS,
  ANEXTVID_SAMPLE_FORMULAS,
  ANEXTVID_SAMPLE_POST_TYPES,
  ANEXTVID_SAMPLE_VARIATIONS,
} from '@postsider/backend/services/builder-samples';

export interface BuilderSectionInput {
  id: string;
  role: string;
  label: string;
  optional?: boolean;
  includeInCaption?: boolean;
  defaultSkipped?: boolean;
}

export interface CreateVariationInput {
  sectionRole: string;
  title?: string | null;
  content: string;
  collectionId?: string | null;
  postTypeId?: string | null;
  lengthHint?: string | null;
}

@Injectable()
export class BuilderService {
  constructor(private readonly _prisma: PrismaService) {}

  private cleanRequiredString(value: unknown, errorMessage: string): string {
    const clean = typeof value === 'string' ? value.trim() : '';
    if (!clean) throw new BadRequestException(errorMessage);
    return clean;
  }

  private cleanOptionalString(value: unknown): string | null {
    return typeof value === 'string' ? value.trim() || null : null;
  }

  private async assertOrgReferences(
    organizationId: string,
    collectionIds: Array<string | null | undefined>,
    postTypeIds: Array<string | null | undefined>,
  ): Promise<void> {
    const uniqueColIds = [
      ...new Set(collectionIds.filter((id): id is string => typeof id === 'string' && id.length > 0)),
    ];
    const uniqueTypeIds = [
      ...new Set(postTypeIds.filter((id): id is string => typeof id === 'string' && id.length > 0)),
    ];

    if (uniqueColIds.length > 0) {
      const cols = await this._prisma.builderCollection.findMany({
        where: { organizationId, id: { in: uniqueColIds } },
        select: { id: true },
      });
      if (cols.length !== uniqueColIds.length) {
        throw new NotFoundException('Collection not found');
      }
    }

    if (uniqueTypeIds.length > 0) {
      const types = await this._prisma.builderPostType.findMany({
        where: { organizationId, id: { in: uniqueTypeIds } },
        select: { id: true },
      });
      if (types.length !== uniqueTypeIds.length) {
        throw new NotFoundException('Post type not found');
      }
    }
  }

  async getState(organizationId: string) {
    const [collections, postTypes, formulas, variations] = await Promise.all([
      this._prisma.builderCollection.findMany({
        where: { organizationId },
        orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
      }),
      this._prisma.builderPostType.findMany({
        where: { organizationId },
        orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
      }),
      this._prisma.builderFormula.findMany({
        where: { organizationId },
        orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
      }),
      this._prisma.builderVariation.findMany({
        where: { organizationId },
        orderBy: [{ createdAt: 'desc' }],
      }),
    ]);

    return { collections, postTypes, formulas, variations };
  }

  // Collections --------------------------------------------------------------

  async createCollection(
    organizationId: string,
    name: string,
    description?: string | null,
  ) {
    const clean = this.cleanRequiredString(name, 'Collection name is required');
    const existing = await this._prisma.builderCollection.findFirst({
      where: { organizationId, name: clean },
    });
    if (existing) {
      throw new ConflictException(`Collection "${clean}" already exists`);
    }
    return this._prisma.builderCollection.create({
      data: {
        organizationId,
        name: clean,
        description: this.cleanOptionalString(description),
      },
    });
  }

  async renameCollection(
    organizationId: string,
    id: string,
    name: string,
    description?: string | null,
  ) {
    const clean = this.cleanRequiredString(name, 'Collection name is required');
    const current = await this._prisma.builderCollection.findFirst({
      where: { id, organizationId },
    });
    if (!current) throw new NotFoundException('Collection not found');

    const conflict = await this._prisma.builderCollection.findFirst({
      where: { organizationId, name: clean, NOT: { id } },
    });
    if (conflict) {
      throw new ConflictException(`Collection "${clean}" already exists`);
    }

    return this._prisma.builderCollection.update({
      where: { id },
      data: {
        name: clean,
        ...(description !== undefined
          ? { description: this.cleanOptionalString(description) }
          : {}),
      },
    });
  }

  async deleteCollection(organizationId: string, id: string) {
    const current = await this._prisma.builderCollection.findFirst({
      where: { id, organizationId },
    });
    if (!current) throw new NotFoundException('Collection not found');
    await this._prisma.builderCollection.delete({ where: { id } });
    return { deleted: true, id };
  }

  // Independent Post Types ---------------------------------------------------

  async createPostType(
    organizationId: string,
    name: string,
    description?: string | null,
  ) {
    const clean = this.cleanRequiredString(name, 'Post type name is required');
    const existing = await this._prisma.builderPostType.findFirst({
      where: { organizationId, name: clean },
    });
    if (existing) {
      throw new ConflictException(`Post type "${clean}" already exists`);
    }
    return this._prisma.builderPostType.create({
      data: {
        organizationId,
        name: clean,
        description: this.cleanOptionalString(description),
      },
    });
  }

  async renamePostType(
    organizationId: string,
    id: string,
    name: string,
    description?: string | null,
  ) {
    const clean = this.cleanRequiredString(name, 'Post type name is required');
    const current = await this._prisma.builderPostType.findFirst({
      where: { id, organizationId },
    });
    if (!current) throw new NotFoundException('Post type not found');

    const conflict = await this._prisma.builderPostType.findFirst({
      where: { organizationId, name: clean, NOT: { id } },
    });
    if (conflict) {
      throw new ConflictException(`Post type "${clean}" already exists`);
    }

    return this._prisma.builderPostType.update({
      where: { id },
      data: {
        name: clean,
        ...(description !== undefined
          ? { description: this.cleanOptionalString(description) }
          : {}),
      },
    });
  }

  async deletePostType(organizationId: string, id: string) {
    const current = await this._prisma.builderPostType.findFirst({
      where: { id, organizationId },
    });
    if (!current) throw new NotFoundException('Post type not found');
    await this._prisma.builderPostType.delete({ where: { id } });
    return { deleted: true, id };
  }

  // Formulas -----------------------------------------------------------------

  async createFormula(
    organizationId: string,
    body: {
      name: string;
      length?: string;
      collectionId?: string | null;
      postTypeId?: string | null;
      sections: BuilderSectionInput[];
    },
  ) {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Formula payload is required');
    }
    const clean = this.cleanRequiredString(body.name, 'Formula name is required');
    if (!Array.isArray(body.sections) || body.sections.length === 0) {
      throw new BadRequestException('Formula must include at least one section');
    }
    await this.assertOrgReferences(
      organizationId,
      [body.collectionId],
      [body.postTypeId],
    );
    return this._prisma.builderFormula.create({
      data: {
        organizationId,
        name: clean,
        length: body.length === 'short' ? 'short' : 'standard',
        collectionId: body.collectionId || null,
        postTypeId: body.postTypeId || null,
        sectionsJson: JSON.stringify(body.sections),
      },
    });
  }

  async updateFormula(
    organizationId: string,
    id: string,
    body: {
      name?: string;
      length?: string;
      collectionId?: string | null;
      postTypeId?: string | null;
      sections?: BuilderSectionInput[];
    },
  ) {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Formula payload is required');
    }
    const current = await this._prisma.builderFormula.findFirst({
      where: { id, organizationId },
    });
    if (!current) throw new NotFoundException('Formula not found');

    const cleanName =
      body.name !== undefined
        ? this.cleanRequiredString(body.name, 'Formula name is required')
        : undefined;
    if (
      body.sections !== undefined &&
      (!Array.isArray(body.sections) || body.sections.length === 0)
    ) {
      throw new BadRequestException('Formula must include at least one section');
    }
    await this.assertOrgReferences(
      organizationId,
      [body.collectionId],
      [body.postTypeId],
    );

    return this._prisma.builderFormula.update({
      where: { id },
      data: {
        ...(cleanName !== undefined ? { name: cleanName } : {}),
        ...(body.length !== undefined
          ? { length: body.length === 'short' ? 'short' : 'standard' }
          : {}),
        ...(body.collectionId !== undefined
          ? { collectionId: body.collectionId || null }
          : {}),
        ...(body.postTypeId !== undefined
          ? { postTypeId: body.postTypeId || null }
          : {}),
        ...(body.sections !== undefined
          ? { sectionsJson: JSON.stringify(body.sections) }
          : {}),
      },
    });
  }

  async deleteFormula(organizationId: string, id: string) {
    const current = await this._prisma.builderFormula.findFirst({
      where: { id, organizationId },
    });
    if (!current) throw new NotFoundException('Formula not found');
    await this._prisma.builderFormula.delete({ where: { id } });
    return { deleted: true, id };
  }

  // Variations ---------------------------------------------------------------

  async createVariations(
    organizationId: string,
    items: CreateVariationInput[],
  ) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('Variation content is required');
    }
    const valid = items
      .filter((item): item is CreateVariationInput => Boolean(item && typeof item === 'object'))
      .map((item) => ({
        organizationId,
        sectionRole:
          (typeof item.sectionRole === 'string' ? item.sectionRole.trim() : '') ||
          'body',
        title: this.cleanOptionalString(item.title),
        content: typeof item.content === 'string' ? item.content.trim() : '',
        collectionId: item.collectionId || null,
        postTypeId: item.postTypeId || null,
        lengthHint:
          item.lengthHint === 'short' || item.lengthHint === 'standard'
            ? item.lengthHint
            : null,
      }))
      .filter((item) => item.content.length > 0);

    if (valid.length === 0) {
      throw new BadRequestException('Variation content is required');
    }

    await this.assertOrgReferences(
      organizationId,
      valid.map((v) => v.collectionId),
      valid.map((v) => v.postTypeId),
    );

    const created = await this._prisma.$transaction(
      valid.map((data) => this._prisma.builderVariation.create({ data })),
    );
    return { created, count: created.length };
  }

  async updateVariation(
    organizationId: string,
    id: string,
    body: {
      sectionRole?: string;
      title?: string | null;
      content?: string;
      collectionId?: string | null;
      postTypeId?: string | null;
    },
  ) {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Variation payload is required');
    }
    const current = await this._prisma.builderVariation.findFirst({
      where: { id, organizationId },
    });
    if (!current) throw new NotFoundException('Variation not found');
    const nextContent =
      body.content !== undefined
        ? this.cleanRequiredString(body.content, 'Variation content cannot be empty')
        : current.content;
    const nextSectionRole =
      body.sectionRole !== undefined
        ? this.cleanRequiredString(
            body.sectionRole,
            'Variation sectionRole cannot be empty',
          )
        : undefined;

    await this.assertOrgReferences(
      organizationId,
      [body.collectionId],
      [body.postTypeId],
    );

    return this._prisma.builderVariation.update({
      where: { id },
      data: {
        ...(nextSectionRole !== undefined ? { sectionRole: nextSectionRole } : {}),
        ...(body.title !== undefined
          ? { title: this.cleanOptionalString(body.title) }
          : {}),
        content: nextContent,
        ...(body.collectionId !== undefined
          ? { collectionId: body.collectionId || null }
          : {}),
        ...(body.postTypeId !== undefined
          ? { postTypeId: body.postTypeId || null }
          : {}),
      },
    });
  }

  async deleteVariation(organizationId: string, id: string) {
    const current = await this._prisma.builderVariation.findFirst({
      where: { id, organizationId },
    });
    if (!current) throw new NotFoundException('Variation not found');
    await this._prisma.builderVariation.delete({ where: { id } });
    return { deleted: true, id };
  }

  // Optional Curated Sample Examples (Idempotent Load + Scoped Delete) ----

  async loadSampleExamples(organizationId: string) {
    const colMap = new Map<string, string>();
    const existingCols = await this._prisma.builderCollection.findMany({
      where: { organizationId },
    });
    for (const c of existingCols) colMap.set(c.name, c.id);

    let createdCollections = 0;
    for (const col of ANEXTVID_SAMPLE_COLLECTIONS) {
      if (!colMap.has(col.name)) {
        const created = await this._prisma.builderCollection.create({
          data: {
            organizationId,
            name: col.name,
            description: col.description,
            isSampleExample: true,
            sampleBatch: ANEXTVID_SAMPLE_BATCH,
          },
        });
        colMap.set(created.name, created.id);
        createdCollections++;
      }
    }

    const typeMap = new Map<string, string>();
    const existingTypes = await this._prisma.builderPostType.findMany({
      where: { organizationId },
    });
    for (const pt of existingTypes) typeMap.set(pt.name, pt.id);

    let createdPostTypes = 0;
    for (const pt of ANEXTVID_SAMPLE_POST_TYPES) {
      if (!typeMap.has(pt.name)) {
        const created = await this._prisma.builderPostType.create({
          data: {
            organizationId,
            name: pt.name,
            description: pt.description,
            isSampleExample: true,
            sampleBatch: ANEXTVID_SAMPLE_BATCH,
          },
        });
        typeMap.set(created.name, created.id);
        createdPostTypes++;
      }
    }

    const existingFormulas = await this._prisma.builderFormula.findMany({
      where: { organizationId, sampleBatch: ANEXTVID_SAMPLE_BATCH },
    });
    const existingFormulaNames = new Set(existingFormulas.map((f) => f.name));
    let createdFormulas = 0;
    for (const f of ANEXTVID_SAMPLE_FORMULAS) {
      if (!existingFormulaNames.has(f.name)) {
        await this._prisma.builderFormula.create({
          data: {
            organizationId,
            name: f.name,
            length: f.length,
            collectionId: colMap.get(f.collectionName) ?? null,
            postTypeId: typeMap.get(f.postTypeName) ?? null,
            sectionsJson: JSON.stringify(f.sections),
            isSampleExample: true,
            sampleBatch: ANEXTVID_SAMPLE_BATCH,
          },
        });
        createdFormulas++;
      }
    }

    const existingVars = await this._prisma.builderVariation.findMany({
      where: { organizationId },
    });
    const existingVarKeys = new Set(
      existingVars.map(
        (v) => `${v.collectionId ?? ''}::${v.sectionRole}::${v.content}`,
      ),
    );
    let createdVariations = 0;
    for (const v of ANEXTVID_SAMPLE_VARIATIONS) {
      const colId = colMap.get(v.collectionName) ?? '';
      const key = `${colId}::${v.sectionRole}::${v.content}`;
      if (!existingVarKeys.has(key)) {
        await this._prisma.builderVariation.create({
          data: {
            organizationId,
            sectionRole: v.sectionRole,
            title: v.title,
            content: v.content,
            collectionId: colMap.get(v.collectionName) ?? null,
            postTypeId: typeMap.get(v.postTypeName) ?? null,
            lengthHint: v.lengthHint,
            isSampleExample: true,
            sampleBatch: ANEXTVID_SAMPLE_BATCH,
          },
        });
        existingVarKeys.add(key);
        createdVariations++;
      }
    }

    return {
      sampleBatch: ANEXTVID_SAMPLE_BATCH,
      createdCollections,
      createdPostTypes,
      createdFormulas,
      createdVariations,
    };
  }

  async deleteSampleExamples(organizationId: string) {
    const [variations, formulas, postTypes, collections] =
      await this._prisma.$transaction([
        this._prisma.builderVariation.deleteMany({
          where: {
            organizationId,
            isSampleExample: true,
            sampleBatch: ANEXTVID_SAMPLE_BATCH,
          },
        }),
        this._prisma.builderFormula.deleteMany({
          where: {
            organizationId,
            isSampleExample: true,
            sampleBatch: ANEXTVID_SAMPLE_BATCH,
          },
        }),
        this._prisma.builderPostType.deleteMany({
          where: {
            organizationId,
            isSampleExample: true,
            sampleBatch: ANEXTVID_SAMPLE_BATCH,
          },
        }),
        this._prisma.builderCollection.deleteMany({
          where: {
            organizationId,
            isSampleExample: true,
            sampleBatch: ANEXTVID_SAMPLE_BATCH,
          },
        }),
      ]);

    return {
      sampleBatch: ANEXTVID_SAMPLE_BATCH,
      deletedCollections: collections.count,
      deletedPostTypes: postTypes.count,
      deletedFormulas: formulas.count,
      deletedVariations: variations.count,
    };
  }
}
