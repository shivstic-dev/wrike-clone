/**
 * Public forms controller — public-facing request form endpoints.
 * No authentication required. External stakeholders can view and submit forms.
 *
 * These endpoints are rate-limited by the ThrottlerModule (100 req/min).
 */
import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { CustomizationService } from './customization.service';
import { SubmitRequestFormDto } from './dto/request-form.dto';

@Controller('public/forms')
export class PublicFormsController {
  constructor(private readonly customizationService: CustomizationService) {}

  /**
   * GET /api/v1/public/forms/:formId — fetch form details (no auth).
   */
  @Get(':formId')
  async getForm(@Param('formId') formId: string) {
    return this.customizationService.getPublicForm(formId);
  }

  /**
   * POST /api/v1/public/forms/:formId/submit — submit form (no auth).
   * Uses a special public submission method that does NOT require
   * tenant context or authentication.
   */
  @Post(':formId/submit')
  async submitForm(
    @Param('formId') formId: string,
    @Body() body: SubmitRequestFormDto,
  ) {
    return this.customizationService.submitPublicRequestForm(formId, body.values);
  }
}
