import { Controller, Get, Query } from '@nestjs/common';
import { BillingService } from './billing.service';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get()
  getSummary() {
    return this.billingService.getSummary();
  }

  @Get('daily')
  getDailyDetail(
    @Query('date') date: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.billingService.getDailyDetail(
      date,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }
}
