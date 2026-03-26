import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'node:crypto';

export interface TokenPayload {
  sub: string;
  email: string;
  tid: string;
  tsl: string;
  role: 'owner' | 'admin' | 'user' | 'viewer';
  kind: 'access' | 'refresh';
  iat: number;
  exp: number;
}

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly secret: string;

  constructor() {
    this.secret = process.env.JWT_ACCESS_SECRET ?? 'dev-secret-access';
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = String(request.headers?.authorization || '');

    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      throw new UnauthorizedException('Token JWT requerido');
    }

    const token = authHeader.slice(7).trim();
    request.user = this.verifyAccessToken(token);
    return true;
  }

  private verifyAccessToken(token: string): TokenPayload {
    const [body, signature] = String(token).split('.');
    if (!body || !signature) throw new UnauthorizedException('Token inválido');

    const expected = crypto.createHmac('sha256', this.secret).update(body).digest('base64url');
    if (signature !== expected) throw new UnauthorizedException('Token inválido');

    let payload: TokenPayload;
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
    } catch {
      throw new UnauthorizedException('Token inválido');
    }

    if (payload.kind !== 'access') throw new UnauthorizedException('Token inválido');
    if (!payload.exp || Date.now() > payload.exp) throw new UnauthorizedException('Token expirado');

    return payload;
  }
}
