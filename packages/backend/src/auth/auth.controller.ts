/**
 * Authentication controller.
 * Endpoints for login, registration, token refresh, password change, and logout.
 * G7: Refresh token is set as httpOnly cookie (Secure; SameSite=None for cross-domain).
 * Access token is returned in the response body (kept in memory by the frontend).
 */

import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  Res,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import {
  loginSchema,
  changePasswordSchema,
  registerSchema,
  adminResetPasswordSchema,
} from '@wrike-clone/shared';
import type { LoginResponse } from '@wrike-clone/shared';

const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Req() req: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse & { mustChangePassword?: boolean }> {
    this.assertTrustedBrowserOrigin(req);
    const input = loginSchema.parse(body);
    const result = (await this.authService.login(input)) as LoginResponse & {
      mustChangePassword?: boolean;
    };

    // G7: Set refresh token as httpOnly cookie
    this.setRefreshCookie(res, (result as any).refreshToken);

    // Strip refresh token from response body — it's in the cookie now
    const { refreshToken: _, ...safeResult } = result as any;

    return safeResult;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    this.assertTrustedBrowserOrigin(req);
    // G7: Try to get refresh token from cookie first, then fall back to body
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] || (body as any)?.refreshToken;
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found');
    }
    const result = await this.authService.refreshToken({ refreshToken });
    this.setRefreshCookie(res, result.refreshToken);
    const { refreshToken: _, ...safeResult } = result;
    return safeResult;
  }

  @Post('change-password')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser('userId') userId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    const input = changePasswordSchema.parse(body);
    await this.authService.changePassword(userId, input.currentPassword, input.newPassword);
    // Clear refresh cookie since all sessions were revoked
    res.clearCookie(REFRESH_COOKIE_NAME, this.cookieOptions());
    return { message: 'Password changed successfully' };
  }

  @Post('admin-reset-password')
  @UseGuards(AuthGuard, RolesGuard)
  @Permissions('user:role:manage')
  @HttpCode(HttpStatus.OK)
  async adminResetPassword(
    @CurrentUser('tenantId') tenantId: string,
    @Body() body: unknown,
  ): Promise<{ message: string }> {
    const input = adminResetPasswordSchema.parse(body);
    await this.authService.adminResetPassword(input.userId, input.tempPassword, tenantId);
    return { message: 'Password reset successful. User must change on next login.' };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    this.assertTrustedBrowserOrigin(req);
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (refreshToken) await this.authService.logout(refreshToken);
    res.clearCookie(REFRESH_COOKIE_NAME, this.cookieOptions());
    return { message: 'Logged out' };
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Req() req: Request, @Body() body: unknown): Promise<{ message: string }> {
    this.assertTrustedBrowserOrigin(req);
    // Guard: public registration disabled by default
    if (process.env['ALLOW_PUBLIC_REGISTRATION'] !== 'true') {
      throw new UnauthorizedException('Public registration is disabled');
    }
    const input = registerSchema.parse(body);
    await this.authService.register(input);
    return { message: 'Registration successful' };
  }

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE_NAME, token, {
      ...this.cookieOptions(),
      maxAge: REFRESH_COOKIE_MAX_AGE,
    });
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: process.env['NODE_ENV'] === 'production' ? ('none' as const) : ('lax' as const),
      path: `${process.env['API_PREFIX'] || '/api/v1'}/auth`,
    };
  }

  /**
   * SameSite=None is required because Vercel and Railway use different sites.
   * Browsers send an Origin header for these cross-site POSTs, so reject any
   * browser origin that is not one of the explicitly configured CORS origins.
   * Requests without Origin remain available to trusted native/server clients.
   */
  private assertTrustedBrowserOrigin(req: Request): void {
    if (process.env['NODE_ENV'] !== 'production') return;

    const origin = req.headers.origin;
    if (!origin) return;

    const trustedOrigins = (process.env['CORS_ORIGINS'] || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (!trustedOrigins.includes(origin)) {
      throw new ForbiddenException('Untrusted request origin');
    }
  }
}
