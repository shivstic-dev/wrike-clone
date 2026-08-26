/**
 * Customization module — custom workflows, item types, and blueprint templates.
 * This allows per-tenant/workspace customization of task statuses, custom item types,
 * and reusable project/task templates (Blueprints).
 */

import { Module } from '@nestjs/common';
import { CustomizationService } from './customization.service';
import { CustomizationController } from './customization.controller';
import { PublicFormsController } from './public-forms.controller';

@Module({
  controllers: [CustomizationController, PublicFormsController],
  providers: [CustomizationService],
  exports: [CustomizationService],
})
export class CustomizationModule {}
