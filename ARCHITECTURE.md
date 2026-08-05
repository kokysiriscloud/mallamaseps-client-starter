# Mallamaseps - Estructura base

## Proyectos
- `mallamaseps-app` (Angular)
- `mallamaseps-api` (NestJS)

## Puertos sugeridos (local)
- Auth portal: `http://localhost:4200`
- Mallamaseps app: `http://localhost:4200`
- Siriscloud auth: `http://localhost:3000`
- Mallamaseps API: `http://localhost:3100`

## Flujo de autenticación
1. Usuario inicia sesión en `siriscloud-auth-portal`.
2. Login exitoso en `siriscloud-auth`.
3. Redirección automática a `http://localhost:4200` para tenant mallamaseps.
4. `mallamaseps-app` consume `mallamaseps-api` y usa JWT emitido por `siriscloud-auth`.

## Próximo paso recomendado
- Crear módulo `auth-gateway` en `mallamaseps-app` para leer sesión del portal.
- Configurar `JwtAuthGuard` en `mallamaseps-api` validando tokens de `siriscloud-auth`.
