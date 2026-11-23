import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization } from '@prisma/client';
import { GetOrgFromRequest } from '@postsider/nestjs-libraries/user/org.from.request';
import {
  BuilderSectionInput,
  BuilderService,
  CreateVariationInput,
} from '@postsider/backend/services/builder.service';

@ApiTags('Builder')
@Controller('/builder')
export class BuilderController {
  constructor(private readonly _builder: BuilderService) {}

  @Get('/state')
  getState(@GetOrgFromRequest() org: Organization) {
    return this._builder.getState(org.id);
  }

  // Collections --------------------------------------------------------------

  @Post('/collections')
  createCollection(
    @GetOrgFromRequest() org: Organization,
    @Body() body: { name: string; description?: string | null },
  ) {
    return this._builder.createCollection(org.id, body?.name, body?.description);
  }

  @Patch('/collections/:id')
  renameCollection(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: { name: string; description?: string | null },
  ) {
    return this._builder.renameCollection(
      org.id,
      id,
      body?.name,
      body?.description,
    );
  }

  @Delete('/collections/:id')
  deleteCollection(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
  ) {
    return this._builder.deleteCollection(org.id, id);
  }

  // Independent Post Types ---------------------------------------------------

  @Post('/post-types')
  createPostType(
    @GetOrgFromRequest() org: Organization,
    @Body() body: { name: string; description?: string | null },
  ) {
    return this._builder.createPostType(org.id, body?.name, body?.description);
  }

  @Patch('/post-types/:id')
  renamePostType(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: { name: string; description?: string | null },
  ) {
    return this._builder.renamePostType(
      org.id,
      id,
      body?.name,
      body?.description,
    );
  }

  @Delete('/post-types/:id')
  deletePostType(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
  ) {
    return this._builder.deletePostType(org.id, id);
  }

  // Formulas -----------------------------------------------------------------

  @Post('/formulas')
  createFormula(
    @GetOrgFromRequest() org: Organization,
    @Body()
    body: {
      name: string;
      length?: string;
      collectionId?: string | null;
      postTypeId?: string | null;
      sections: BuilderSectionInput[];
    },
  ) {
    return this._builder.createFormula(org.id, body);
  }

  @Patch('/formulas/:id')
  updateFormula(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      length?: string;
      collectionId?: string | null;
      postTypeId?: string | null;
      sections?: BuilderSectionInput[];
    },
  ) {
    return this._builder.updateFormula(org.id, id, body);
  }

  @Delete('/formulas/:id')
  deleteFormula(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
  ) {
    return this._builder.deleteFormula(org.id, id);
  }

  // Variations ---------------------------------------------------------------

  @Post('/variations')
  createVariations(
    @GetOrgFromRequest() org: Organization,
    @Body()
    body:
      | CreateVariationInput
      | { items: CreateVariationInput[] },
  ) {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Variation payload is required');
    }
    const items = 'items' in body ? body.items : [body];
    return this._builder.createVariations(org.id, items);
  }

  @Patch('/variations/:id')
  updateVariation(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body()
    body: {
      sectionRole?: string;
      title?: string | null;
      content?: string;
      collectionId?: string | null;
      postTypeId?: string | null;
    },
  ) {
    return this._builder.updateVariation(org.id, id, body);
  }

  @Delete('/variations/:id')
  deleteVariation(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
  ) {
    return this._builder.deleteVariation(org.id, id);
  }

  // Optional Curated Sample Examples ---------------------------------------

  @Post('/examples/load')
  loadSampleExamples(@GetOrgFromRequest() org: Organization) {
    return this._builder.loadSampleExamples(org.id);
  }

  @Delete('/examples')
  deleteSampleExamples(@GetOrgFromRequest() org: Organization) {
    return this._builder.deleteSampleExamples(org.id);
  }
}
