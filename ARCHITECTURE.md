# Mallamaseps - Estructura base

## Proyectos
- `mallamaseps-app` (Angular)
- `mallamaseps-api` (NestJS)

## Puertos sugeridos (local)
- Auth portal: `http://localhost:4200`
- Mallamaseps app: `http://localhost:4200`
- Siriscloud auth: `http://localhost:3000`
- Mallamaseps API: `http://localhost:3100`

## Levantar en local (Docker)
```bash
docker compose up          # app en :4200, api en :3100, con hot reload
docker compose up -d       # en segundo plano
docker compose logs -f api # ver logs de un servicio
docker compose down        # apagar
```
- El API lee `mallamaseps-api/.env` (no versionado). Por defecto apunta a la base remota de ese archivo.
- Para una Postgres local en vez de la remota: `docker compose --profile local-db up` y pon `DB_HOST=db`, `DB_PORT=5432` en el `.env`.
- `node_modules` vive en volúmenes de Docker, aparte de los del host.
- Tras cambiar `package.json`: `docker compose up --build`.

## Flujo de autenticación
1. Usuario inicia sesión en `siriscloud-auth-portal`.
2. Login exitoso en `siriscloud-auth`.
3. Redirección automática a `http://localhost:4200` para tenant mallamaseps.
4. `mallamaseps-app` consume `mallamaseps-api` y usa JWT emitido por `siriscloud-auth`.

## Próximo paso recomendado
- Crear módulo `auth-gateway` en `mallamaseps-app` para leer sesión del portal.
- Configurar `JwtAuthGuard` en `mallamaseps-api` validando tokens de `siriscloud-auth`.
