import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { UserService } from './user.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { inviteUserSchema, updateMembershipSchema } from '@wrike-clone/shared';

@Controller('users')
@UseGuards(AuthGuard, RolesGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @Permissions('tenant:read')
  async findAll(@Query('page') page?: number, @Query('perPage') perPage?: number) {
    return this.userService.findAll(page || 1, perPage || 25);
  }

  @Post('invite')
  @Permissions('user:invite')
  async invite(@Body() body: unknown) {
    const input = inviteUserSchema.parse(body);
    return this.userService.invite(input);
  }

  @Patch(':userId/role')
  @Permissions('user:role:manage')
  async updateRole(@Param('userId') userId: string, @Body() body: unknown) {
    const input = updateMembershipSchema.parse(body);
    return this.userService.updateMembership(userId, input);
  }

  @Delete(':userId')
  @Permissions('user:remove')
  async remove(@Param('userId') userId: string) {
    await this.userService.remove(userId);
    return { message: 'User removed from tenant' };
  }
}
