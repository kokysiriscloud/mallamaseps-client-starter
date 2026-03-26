import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingMetadata } from '../usage/billing-metadata.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BillingMetadata])],
  controllers: [BillingController],
  providers: [BillingService],
})
export class BillingModule {}
