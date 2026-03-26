import { Controller, Get, Put, Body, Query, Res, Header, Req, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { BillingService } from './billing.service';
import { AuthGuard } from '../auth.guard';

@UseGuards(AuthGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get()
  getSummary(@Req() req: Request & { user?: any }) {
    const tenantId = String(req?.user?.tid || 'default-tenant');
    return this.billingService.getSummary(tenantId);
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
  updateBudget(
    @Req() req: Request & { user?: any },
    @Body() body: { limit: number },
  ) {
    const tenantId = String(req?.user?.tid || 'default-tenant');
    return this.billingService.updateBudget(tenantId, body.limit);
  }

  @Put('alerts')
  updateAlerts(
    @Req() req: Request & { user?: any },
    @Body() body: { warningPercent: number; criticalPercent: number },
  ) {
    const tenantId = String(req?.user?.tid || 'default-tenant');
    return this.billingService.updateAlerts(tenantId, body);
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
