import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthGuard } from './auth.guard';
import { UsageModule } from './usage/usage.module';
import { BillingModule } from './billing/billing.module';
import { RequestLog } from './usage/request-log.entity';
import { BillingMetadata } from './usage/billing-metadata.entity';
import { BillingConfig } from './billing/billing-config.entity';
import { BillingLiquidation } from './billing/billing-liquidation.entity';
import { BillingRateConfig } from './billing/billing-rate-config.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: parseInt(process.env.DB_PORT ?? '5432', 10),
      username: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
      database: process.env.DB_NAME ?? 'postgres',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
      entities: [RequestLog, BillingMetadata, BillingConfig, BillingLiquidation, BillingRateConfig],
      synchronize: process.env.NODE_ENV !== 'production',
    }),
    UsageModule,
    BillingModule,
  ],
  controllers: [AppController],
  providers: [AppService, AuthGuard],
})
export class AppModule {}
