import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = String(request.headers?.authorization || '');

    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      throw new UnauthorizedException('Token JWT requerido');
    }

    // TODO: validar firma JWT con siriscloud-auth (JWKS/shared secret)
    return true;
  }
}
