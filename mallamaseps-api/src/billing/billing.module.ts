import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingMetadata } from '../usage/billing-metadata.entity';
import { BillingConfig } from './billing-config.entity';
import { BillingLiquidation } from './billing-liquidation.entity';
import { BillingRateConfig } from './billing-rate-config.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BillingMetadata, BillingConfig, BillingLiquidation, BillingRateConfig])],
  controllers: [BillingController],
  providers: [BillingService],
})
export class BillingModule {}
