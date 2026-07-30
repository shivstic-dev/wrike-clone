import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PERMISSIONS_KEY } from '../../src/common/decorators/permissions.decorator';
import { AuthGuard } from '../../src/common/guards/auth.guard';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { TimelineController } from '../../src/timeline/timeline.controller';

const query = { from: '2026-08-01', to: '2026-08-31', perPage: '25' };

describe('TimelineController', () => {
  it('protects both timeline routes with task read access', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, TimelineController)).toEqual([AuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, TimelineController.prototype.dashboard)).toEqual(['task:read']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, TimelineController.prototype.project)).toEqual(['task:read']);
  });

  it('validates dashboard queries before calling the service', async () => {
    const dashboard = jest.fn().mockResolvedValue({});
    const controller = new TimelineController({ dashboard } as never);

    await controller.dashboard(query);

    expect(dashboard).toHaveBeenCalledWith(expect.objectContaining({ perPage: 25 }));
  });

  it('passes the path project id separately from untrusted query data', async () => {
    const project = jest.fn().mockResolvedValue({});
    const controller = new TimelineController({ project } as never);

    await controller.project('project-path', { ...query, projectId: 'e7d22702-f992-4590-8d20-f74bfe13ac8c' });

    expect(project).toHaveBeenCalledWith('project-path', expect.not.objectContaining({ projectId: expect.anything() }));
  });

  it('returns a 400 for invalid timeline query data', async () => {
    const controller = new TimelineController({ dashboard: jest.fn() } as never);

    await expect(controller.dashboard({ from: 'bad', to: 'also-bad' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
