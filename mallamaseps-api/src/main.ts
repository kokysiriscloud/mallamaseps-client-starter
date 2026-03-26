import 'dotenv/config';
import { types } from 'pg';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// Parsear "timestamp without time zone" como UTC (OID 1114)
types.setTypeParser(1114, (str: string) => new Date(str + 'Z'));

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: ['http://localhost:4200', 'http://localhost:4300'], credentials: true });
  await app.listen(process.env.PORT ?? 3100);
}
bootstrap();
