import { Controller, Get, Put, Post, Patch, Param, Body, Query, Res, Header, Req, UseGuards } from '@nestjs/common';
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

  @Get('rate')
  getRate(@Req() req: Request & { user?: any }) {
    const tenantId = String(req?.user?.tid || 'default-tenant');
    return this.billingService.getActiveRate(tenantId);
  }

  @Put('rate')
  upsertRate(
    @Req() req: Request & { user?: any },
    @Body() body: { tier1LimitPages: number; tier1Rate: number; tier2Rate: number },
  ) {
    const tenantId = String(req?.user?.tid || 'default-tenant');
    const userId = String(req?.user?.sub || 'system');
    return this.billingService.upsertRate(tenantId, userId, body);
  }

  @Post('liquidations/preview')
  previewLiquidation(
    @Req() req: Request & { user?: any },
    @Body() body: { cutoffDate: string },
  ) {
    const tenantId = String(req?.user?.tid || 'default-tenant');
    return this.billingService.previewLiquidation(tenantId, body?.cutoffDate);
  }

  @Post('liquidations/preview/export')
  @Header('Content-Type', 'text/csv')
  async exportPreviewCsv(
    @Req() req: Request & { user?: any },
    @Body() body: { cutoffDate: string },
    @Res() res: Response,
  ) {
    const tenantId = String(req?.user?.tid || 'default-tenant');
    const cutoffDate = String(body?.cutoffDate || '').trim() || 'cutoff';
    const csv = await this.billingService.exportPreviewCsv(tenantId, cutoffDate);
    res.setHeader('Content-Disposition', `attachment; filename="billing-preview-${cutoffDate}.csv"`);
    res.send(csv);
  }

  @Post('liquidations')
  liquidate(
    @Req() req: Request & { user?: any },
    @Body() body: { cutoffDate: string },
  ) {
    const tenantId = String(req?.user?.tid || 'default-tenant');
    const userId = String(req?.user?.sub || 'system');
    return this.billingService.liquidate(tenantId, userId, body?.cutoffDate);
  }

  @Get('liquidations')
  listLiquidations(@Req() req: Request & { user?: any }) {
    const tenantId = String(req?.user?.tid || 'default-tenant');
    return this.billingService.listLiquidations(tenantId);
  }

  @Patch('liquidations/:id/pay')
  markLiquidationPay(
    @Req() req: Request & { user?: any },
    @Param('id') id: string,
  ) {
    const tenantId = String(req?.user?.tid || 'default-tenant');
    const userId = String(req?.user?.sub || 'system');
    return this.billingService.markLiquidationPay(tenantId, userId, Number(id || 0));
  }

  @Get('liquidations/:id/export')
  @Header('Content-Type', 'text/csv')
  async exportLiquidationCsv(
    @Req() req: Request & { user?: any },
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const tenantId = String(req?.user?.tid || 'default-tenant');
    const csv = await this.billingService.exportLiquidationCsv(tenantId, Number(id || 0));
    res.setHeader('Content-Disposition', `attachment; filename="billing-liquidation-${id}.csv"`);
    res.send(csv);
  }
}
