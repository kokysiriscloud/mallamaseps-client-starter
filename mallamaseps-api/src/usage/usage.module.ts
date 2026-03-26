import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsageController } from './usage.controller';
import { UsageService } from './usage.service';
import { AuthGuard } from '../auth.guard';
import { BillingMetadata } from './billing-metadata.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BillingMetadata])],
  controllers: [UsageController],
  providers: [UsageService, AuthGuard],
})
export class UsageModule {}
