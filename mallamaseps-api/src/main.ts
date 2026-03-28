import 'dotenv/config';
import { types } from 'pg';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

// Parsear "timestamp without time zone" como UTC (OID 1114)
types.setTypeParser(1114, (str: string) => new Date(str + 'Z'));

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('HTTP');

  app.use((req: any, res: any, next: any) => {
    const started = Date.now();
    const method = String(req.method || 'GET');
    const url = String(req.originalUrl || req.url || '/');

    logger.log(`→ ${method} ${url}`);

    res.on('finish', () => {
      const ms = Date.now() - started;
      const status = Number(res.statusCode || 0);
      const line = `← ${status} ${method} ${url} (${ms}ms)`;
      if (status >= 400) logger.error(line);
      else logger.log(line);
    });

    next();
  });

  app.setGlobalPrefix('api');
  app.enableCors({ origin: ['http://localhost:4200', 'http://localhost:4300', 'https://api-auth.siriscloud.com.co', 'https://mallamaseps.siriscloud.com.co'], credentials: true });
  await app.listen(process.env.PORT ?? 3100);
}
bootstrap();
