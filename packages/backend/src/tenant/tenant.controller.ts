import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { TenantService } from './tenant.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { bootstrapTenantSchema, createTenantSchema, updateTenantSchema } from '@wrike-clone/shared';

@Controller('tenants')
export class TenantController {
  private readonly setupKey: string;

  constructor(private readonly tenantService: TenantService) {
    this.setupKey = process.env['SETUP_KEY'] || '';
  }

  @Get(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Permissions('tenant:read')
  async findOne(@Param('id') id: string) {
    return this.tenantService.findById(id);
  }

  @Get('slug/:slug')
  async findBySlug(@Param('slug') slug: string) {
    const tenant = await this.tenantService.findBySlug(slug);
    if (!tenant) return null;
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      logoUrl: tenant.logo_url,
    };
  }

  @Post()
  async create(@Body() body: unknown, @Headers('x-setup-key') setupKey?: string) {
    // Production always requires a configured setup key. Development accepts
    // a key when one is configured.
    if (
      (process.env['NODE_ENV'] === 'production' && !this.setupKey) ||
      (this.setupKey && setupKey !== this.setupKey)
    ) {
      throw new UnauthorizedException('Valid setup key required to create tenant');
    }
    const input = createTenantSchema.parse(body);
    return this.tenantService.create(input);
  }

  @Post('bootstrap')
  async bootstrap(@Body() body: unknown, @Headers('x-setup-key') setupKey?: string) {
    if (
      (process.env['NODE_ENV'] === 'production' && !this.setupKey) ||
      (this.setupKey && setupKey !== this.setupKey)
    ) {
      throw new UnauthorizedException('Valid setup key required to bootstrap tenant');
    }
    const input = bootstrapTenantSchema.parse(body);
    return this.tenantService.bootstrap(input);
  }

  @Patch(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Permissions('tenant:write')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const input = updateTenantSchema.parse(body);
    return this.tenantService.update(id, input);
  }
}
