import { Controller, Get, Patch, Param, Query, UseGuards } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

@Controller('notifications')
@UseGuards(AuthGuard, RolesGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  async findAll(@Query('page') page?: number, @Query('perPage') perPage?: number) {
    return this.notificationService.findAll(page, perPage);
  }

  @Get('unread-count')
  async unreadCount() {
    const count = await this.notificationService.getUnreadCount();
    return { unreadCount: count };
  }

  @Patch(':id/read')
  async markAsRead(@Param('id') id: string) {
    await this.notificationService.markAsRead(id);
    return { message: 'Marked as read' };
  }

  @Patch('read-all')
  async markAllAsRead() {
    await this.notificationService.markAllAsRead();
    return { message: 'All marked as read' };
  }
}
