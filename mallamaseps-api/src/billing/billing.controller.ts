import { Controller, Get, Put, Body, Query, Res, Header } from '@nestjs/common';
import type { Response } from 'express';
import { BillingService } from './billing.service';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get()
  getSummary() {
    return this.billingService.getSummary();
  }

  @Get('export')
  @Header('Content-Type', 'text/csv')
  async exportCsv(@Res() res: Response) {
    const now = new Date();
    const month = now.toLocaleString('en-US', { month: 'short', year: 'numeric' }).replace(' ', '-');
    res.setHeader('Content-Disposition', `attachment; filename="usage-${month}.csv"`);
    const csv = await this.billingService.exportCsv();
    res.send(csv);
  }

  @Put('budget')
  updateBudget(@Body() body: { limit: number }) {
    return this.billingService.updateBudget(body.limit);
  }

  @Put('alerts')
  updateAlerts(@Body() body: { warningPercent: number; criticalPercent: number }) {
    return this.billingService.updateAlerts(body);
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
