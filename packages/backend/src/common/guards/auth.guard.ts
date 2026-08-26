/**
 * Authentication guard.
 * Validates JWT tokens from the Authorization header.
 * On success, attaches user info to req.user.
 */

import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { verify } from 'jsonwebtoken';
import { loadAuthConfig } from '../../config/app.config';

export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  membershipId: string;
  email: string;
  role: string;
  permissions: string[];
}

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing or invalid authorization header');
    }

    try {
      const config = loadAuthConfig();
      const payload = verify(token, config.jwtSecret, {
        algorithms: ['HS256'],
        issuer: config.issuer,
        audience: config.audience,
      }) as any;
      if (!payload.sub || !payload.tenantId || !payload.membershipId || !payload.email) {
        throw new Error('Token is missing required claims');
      }
      request.user = {
        userId: payload.sub || payload.userId,
        tenantId: payload.tenantId,
        membershipId: payload.membershipId,
        email: payload.email,
        role: payload.role,
        permissions: payload.permissions || [],
      } as AuthenticatedUser;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractToken(request: Request): string | undefined {
    const auth = request.headers.authorization;
    if (!auth) return undefined;
    const [type, token] = auth.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
