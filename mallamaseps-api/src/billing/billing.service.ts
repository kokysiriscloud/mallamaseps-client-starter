import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, Repository } from 'typeorm';
import { BillingMetadata } from '../usage/billing-metadata.entity';
import { BillingConfig } from './billing-config.entity';
import { BillingLiquidation } from './billing-liquidation.entity';
import { BillingRateConfig } from './billing-rate-config.entity';

export interface DailyUsage {
  date: string;       // YYYY-MM-DD
  documents: number;
  pages: number;
}

export interface UsageAlerts {
  warningPercent: number;
  criticalPercent: number;
}

export interface BudgetInfo {
  limit: number;
  used: number;
  spent: number;
  budgetCap: number;
  costPerPage: number;
  resetsIn: number;
}

export interface BillingSummary {
  period: string;
  totalDocuments: number;
  totalPages: number;
  budget: BudgetInfo;
  alerts: UsageAlerts;
  daily: DailyUsage[];
}

export interface DailyDetail {
  date: string;
  records: {
    id: number;
    documentId: string | null;
    filename: string | null;
    pages: number;
    createdAt: string;
  }[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

export interface BillingRateView {
  tier1LimitPages: number;
  tier1Rate: number;
  tier2Rate: number;
  effectiveFrom: string;
}

export interface BillingLiquidationPreview {
  cutoffDate: string;
  totalDocuments: number;
  totalPages: number;
  tier1Pages: number;
  tier1Rate: number;
  tier1Amount: number;
  tier2Pages: number;
  tier2Rate: number;
  tier2Amount: number;
  totalAmount: number;
}

@Injectable()
export class BillingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('BillingService');
  private alertsInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(BillingMetadata)
    private readonly billingRepo: Repository<BillingMetadata>,
    @InjectRepository(BillingConfig)
    private readonly billingConfigRepo: Repository<BillingConfig>,
    @InjectRepository(BillingLiquidation)
    private readonly billingLiquidationRepo: Repository<BillingLiquidation>,
    @InjectRepository(BillingRateConfig)
    private readonly billingRateRepo: Repository<BillingRateConfig>,
    private readonly dataSource: DataSource,
  ) {}

  onModuleInit(): void {
    const enabled = String(process.env.USAGE_ALERTS_JOB_ENABLED ?? 'true').toLowerCase() === 'true';
    if (!enabled) {
      this.logger.warn('USAGE_ALERTS_JOB_ENABLED=false. Job de alertas deshabilitado.');
      return;
    }

    const everyMs = Math.max(60_000, Number(process.env.USAGE_ALERTS_JOB_INTERVAL_MS || 600_000));
    this.alertsInterval = setInterval(() => {
      this.runUsageAlertsJob().catch((error) => {
        this.logger.error(`Error en job de alertas: ${error?.message || error}`);
      });
    }, everyMs);

    this.logger.log(`Job de alertas de uso iniciado cada ${everyMs}ms`);

    this.runUsageAlertsJob().catch((error) => {
      this.logger.error(`Error en ejecución inicial de alertas: ${error?.message || error}`);
    });
  }

  onModuleDestroy(): void {
    if (this.alertsInterval) {
      clearInterval(this.alertsInterval);
      this.alertsInterval = null;
    }
  }

  async getSummary(tenantId: string): Promise<BillingSummary> {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);

    const period = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });

    const [totalsRaw, dailyRaw] = await Promise.all([
      this.billingRepo
        .createQueryBuilder('b')
        .select('COUNT(*)', 'totalDocuments')
        .addSelect('COALESCE(SUM(b.extractedPages), 0)', 'totalPages')
        .where('b.createdAt >= :start AND b.createdAt <= :end', {
          start: startOfMonth,
          end: endOfMonth,
        })
        .getRawOne(),

      this.billingRepo
        .createQueryBuilder('b')
        .select("TO_CHAR(b.created_at, 'YYYY-MM-DD')", 'date')
        .addSelect('COUNT(*)', 'documents')
        .addSelect('COALESCE(SUM(b.extracted_pages), 0)', 'pages')
        .where('b.createdAt >= :start AND b.createdAt <= :end', {
          start: startOfMonth,
          end: endOfMonth,
        })
        .groupBy("TO_CHAR(b.created_at, 'YYYY-MM-DD')")
        .orderBy('date', 'ASC')
        .getRawMany(),
    ]);

    const totalDocuments = parseInt(totalsRaw.totalDocuments, 10) || 0;
    const totalPages = parseInt(totalsRaw.totalPages, 10) || 0;
    const config = await this.getOrCreateConfig(tenantId);
    const rate = await this.getActiveRateConfig(tenantId);

    // Days until month resets
    const lastDay = new Date(year, month + 1, 0).getDate();
    const resetsIn = lastDay - now.getDate();

    // Fill all days of the month (so the chart has no gaps)
    const dailyMap = new Map<string, DailyUsage>();
    for (const row of dailyRaw) {
      dailyMap.set(row.date, {
        date: row.date,
        documents: parseInt(row.documents, 10) || 0,
        pages: parseInt(row.pages, 10) || 0,
      });
    }

    const daily: DailyUsage[] = [];
    for (let d = 1; d <= lastDay; d++) {
      const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      daily.push(dailyMap.get(key) ?? { date: key, documents: 0, pages: 0 });
    }

    const spentBreakdown = this.calculateTierBreakdown(totalPages, rate);
    const capBreakdown = this.calculateTierBreakdown(config.budgetLimitPages, rate);

    return {
      period,
      totalDocuments,
      totalPages,
      budget: {
        limit: config.budgetLimitPages,
        used: totalPages,
        spent: spentBreakdown.totalAmount,
        budgetCap: capBreakdown.totalAmount,
        costPerPage: totalPages > rate.tier1LimitPages ? rate.tier2Rate : rate.tier1Rate,
        resetsIn,
      },
      alerts: {
        warningPercent: config.warningPercent,
        criticalPercent: config.criticalPercent,
      },
      daily,
    };
  }

  private calculateTierBreakdown(
    totalPages: number,
    rate: { tier1LimitPages: number; tier1Rate: number; tier2Rate: number },
  ): { tier1Pages: number; tier1Amount: number; tier2Pages: number; tier2Amount: number; totalAmount: number } {
    const tier1Limit = Math.max(1, Number(rate.tier1LimitPages || 1_000_000));
    const tier1Rate = Math.max(0, Number(rate.tier1Rate || 80));
    const tier2Rate = Math.max(0, Number(rate.tier2Rate || 60));

    const pages = Math.max(0, Number(totalPages || 0));
    const tier1Pages = Math.min(pages, tier1Limit);
    const tier2Pages = Math.max(0, pages - tier1Limit);

    const tier1Amount = tier1Pages * tier1Rate;
    const tier2Amount = tier2Pages * tier2Rate;

    return {
      tier1Pages,
      tier1Amount,
      tier2Pages,
      tier2Amount,
      totalAmount: tier1Amount + tier2Amount,
    };
  }

  async updateBudget(tenantId: string, limit: number): Promise<BudgetInfo> {
    const config = await this.getOrCreateConfig(tenantId);
    config.budgetLimitPages = Math.max(1, Number(limit || 1));
    config.updatedAt = new Date();
    await this.billingConfigRepo.save(config);

    // Recalculate with current month totals
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const totalsRaw = await this.billingRepo
      .createQueryBuilder('b')
      .select('COALESCE(SUM(b.extractedPages), 0)', 'totalPages')
      .where('b.createdAt >= :start AND b.createdAt <= :end', {
        start: startOfMonth,
        end: endOfMonth,
      })
      .getRawOne();

    const totalPages = parseInt(totalsRaw.totalPages, 10) || 0;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const resetsIn = lastDay - now.getDate();
    const rate = await this.getActiveRateConfig(tenantId);
    const spentBreakdown = this.calculateTierBreakdown(totalPages, rate);
    const capBreakdown = this.calculateTierBreakdown(config.budgetLimitPages, rate);

    return {
      limit: config.budgetLimitPages,
      used: totalPages,
      spent: spentBreakdown.totalAmount,
      budgetCap: capBreakdown.totalAmount,
      costPerPage: totalPages > rate.tier1LimitPages ? rate.tier2Rate : rate.tier1Rate,
      resetsIn,
    };
  }

  async updateAlerts(tenantId: string, alerts: UsageAlerts): Promise<UsageAlerts> {
    const config = await this.getOrCreateConfig(tenantId);

    config.warningPercent = Math.max(1, Math.min(100, Number(alerts.warningPercent || 80)));
    config.criticalPercent = Math.max(1, Math.min(100, Number(alerts.criticalPercent || 100)));

    if (config.criticalPercent < config.warningPercent) {
      config.criticalPercent = config.warningPercent;
    }

    config.updatedAt = new Date();
    await this.billingConfigRepo.save(config);

    return {
      warningPercent: config.warningPercent,
      criticalPercent: config.criticalPercent,
    };
  }

  async getActiveRate(tenantId: string): Promise<BillingRateView> {
    const rate = await this.getActiveRateConfig(tenantId);
    return {
      tier1LimitPages: rate.tier1LimitPages,
      tier1Rate: rate.tier1Rate,
      tier2Rate: rate.tier2Rate,
      effectiveFrom: rate.effectiveFrom?.toISOString?.() || new Date().toISOString(),
    };
  }

  async upsertRate(
    tenantId: string,
    userId: string,
    input: { tier1LimitPages: number; tier1Rate: number; tier2Rate: number },
  ): Promise<BillingRateView> {
    const tid = String(tenantId || '').trim() || 'default-tenant';

    await this.billingRateRepo.update({ tenantId: tid, isActive: true }, { isActive: false, effectiveTo: new Date() });

    const created = this.billingRateRepo.create({
      tenantId: tid,
      tier1LimitPages: Math.max(1, Number(input.tier1LimitPages || 1_000_000)),
      tier1Rate: Math.max(0, Number(input.tier1Rate || 80)),
      tier2Rate: Math.max(0, Number(input.tier2Rate || 60)),
      effectiveFrom: new Date(),
      effectiveTo: null,
      isActive: true,
      createdBy: String(userId || '').trim() || null,
      createdAt: new Date(),
    });

    const saved = await this.billingRateRepo.save(created);
    return {
      tier1LimitPages: saved.tier1LimitPages,
      tier1Rate: saved.tier1Rate,
      tier2Rate: saved.tier2Rate,
      effectiveFrom: saved.effectiveFrom?.toISOString?.() || new Date().toISOString(),
    };
  }

  async previewLiquidation(tenantId: string, cutoffDate: string): Promise<BillingLiquidationPreview> {
    const cutoff = this.resolveCutoffDate(cutoffDate);
    const rate = await this.getActiveRateConfig(tenantId);

    const rows = await this.billingRepo
      .createQueryBuilder('b')
      .select('COUNT(*)', 'totalDocuments')
      .addSelect('COALESCE(SUM(COALESCE(b.extractedPages, 0)), 0)', 'totalPages')
      .where('b.createdAt <= :cutoff', { cutoff })
      .andWhere('(b.billingStatus IS NULL OR b.billingStatus = :status)', { status: 'unbilled' })
      .getRawOne();

    const totalDocuments = parseInt(rows?.totalDocuments || '0', 10) || 0;
    const totalPages = parseInt(rows?.totalPages || '0', 10) || 0;
    const breakdown = this.calculateTierBreakdown(totalPages, rate);

    return {
      cutoffDate: cutoff.toISOString(),
      totalDocuments,
      totalPages,
      tier1Pages: breakdown.tier1Pages,
      tier1Rate: rate.tier1Rate,
      tier1Amount: breakdown.tier1Amount,
      tier2Pages: breakdown.tier2Pages,
      tier2Rate: rate.tier2Rate,
      tier2Amount: breakdown.tier2Amount,
      totalAmount: breakdown.totalAmount,
    };
  }

  async liquidate(tenantId: string, userId: string, cutoffDate: string): Promise<any> {
    const tid = String(tenantId || '').trim() || 'default-tenant';
    const uid = String(userId || '').trim() || 'system';
    const preview = await this.previewLiquidation(tid, cutoffDate);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const liquidation = queryRunner.manager.create(BillingLiquidation, {
        tenantId: tid,
        cutoffDate: new Date(preview.cutoffDate),
        totalDocuments: preview.totalDocuments,
        totalPages: preview.totalPages,
        tier1Pages: preview.tier1Pages,
        tier1Rate: preview.tier1Rate,
        tier1Amount: preview.tier1Amount,
        tier2Pages: preview.tier2Pages,
        tier2Rate: preview.tier2Rate,
        tier2Amount: preview.tier2Amount,
        totalAmount: preview.totalAmount,
        status: 'pending_pay',
        createdBy: uid,
        createdAt: new Date(),
      });

      const saved = await queryRunner.manager.save(BillingLiquidation, liquidation);

      await queryRunner.manager
        .createQueryBuilder()
        .update(BillingMetadata)
        .set({
          billingStatus: 'pending_pay',
          billingId: saved.id,
          billingMarkedAt: new Date(),
          billingMarkedBy: uid,
        })
        .where('created_at <= :cutoff', { cutoff: new Date(preview.cutoffDate) })
        .andWhere('(billing_status IS NULL OR billing_status = :status)', { status: 'unbilled' })
        .execute();

      await queryRunner.commitTransaction();

      await this.sendLiquidationNotification({
        tenantId: tid,
        userId: uid,
        liquidationId: saved.id,
        cutoffDate: preview.cutoffDate,
        totalDocuments: preview.totalDocuments,
        totalPages: preview.totalPages,
        totalAmount: preview.totalAmount,
      });

      return { ok: true, liquidationId: saved.id, ...preview, status: 'pending_pay' };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async listLiquidations(tenantId: string): Promise<any[]> {
    const rows = await this.billingLiquidationRepo.find({
      where: { tenantId: String(tenantId || '').trim() || 'default-tenant' },
      order: { createdAt: 'DESC' },
      take: 200,
    });

    return rows.map((r) => ({
      id: r.id,
      cutoffDate: r.cutoffDate,
      totalDocuments: r.totalDocuments,
      totalPages: r.totalPages,
      totalAmount: Number(r.totalAmount || 0),
      status: r.status,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
      paidAt: r.paidAt,
    }));
  }

  async markLiquidationPay(tenantId: string, userId: string, billingId: number): Promise<any> {
    const tid = String(tenantId || '').trim() || 'default-tenant';
    const uid = String(userId || '').trim() || 'system';

    const row = await this.billingLiquidationRepo.findOne({ where: { id: Number(billingId || 0), tenantId: tid } });
    if (!row) throw new Error(`No existe billing ${billingId}`);

    row.status = 'pay';
    row.paidAt = new Date();
    await this.billingLiquidationRepo.save(row);

    await this.billingRepo
      .createQueryBuilder()
      .update(BillingMetadata)
      .set({ billingStatus: 'pay', billingMarkedAt: new Date(), billingMarkedBy: uid })
      .where('billing_id = :billingId', { billingId: row.id })
      .andWhere('billing_status = :status', { status: 'pending_pay' })
      .execute();

    return { ok: true, id: row.id, status: row.status, paidAt: row.paidAt };
  }

  async exportLiquidationCsv(tenantId: string, billingId: number): Promise<string> {
    const tid = String(tenantId || '').trim() || 'default-tenant';
    const id = Number(billingId || 0);

    const row = await this.billingLiquidationRepo.findOne({ where: { id, tenantId: tid } });
    if (!row) throw new Error(`No existe billing ${billingId}`);

    const records = await this.billingRepo.find({ where: { billingId: id }, order: { createdAt: 'DESC' } });

    const header = 'id,document_id,filename,extracted_pages,billing_status,billing_id,created_at';
    const csvRows = records.map((r) => {
      const filename = String(r.filename || '').replace(/"/g, '""');
      const docId = String(r.documentId || '').replace(/"/g, '""');
      const createdAt = r.createdAt?.toISOString?.() || '';
      return `${r.id},"${docId}","${filename}",${Number(r.extractedPages || 0)},${String(r.billingStatus || '')},${Number(r.billingId || 0)},${createdAt}`;
    });

    return [header, ...csvRows].join('\n');
  }

  private resolveCutoffDate(cutoffDate: string): Date {
    const raw = String(cutoffDate || '').trim();
    if (!raw) throw new Error('cutoffDate es obligatorio');
    const base = new Date(`${raw}T23:59:59.999Z`);
    if (Number.isNaN(base.getTime())) throw new Error('cutoffDate inválido');
    return base;
  }

  private async getActiveRateConfig(tenantId: string): Promise<BillingRateConfig> {
    const tid = String(tenantId || '').trim() || 'default-tenant';
    let rate = await this.billingRateRepo.findOne({
      where: { tenantId: tid, isActive: true },
      order: { effectiveFrom: 'DESC', id: 'DESC' },
    });

    if (rate) return rate;

    rate = this.billingRateRepo.create({
      tenantId: tid,
      tier1LimitPages: 1_000_000,
      tier1Rate: 80,
      tier2Rate: 60,
      effectiveFrom: new Date(),
      effectiveTo: null,
      isActive: true,
      createdBy: 'system',
      createdAt: new Date(),
    });

    return this.billingRateRepo.save(rate);
  }

  private async sendLiquidationNotification(input: {
    tenantId: string;
    userId: string;
    liquidationId: number;
    cutoffDate: string;
    totalDocuments: number;
    totalPages: number;
    totalAmount: number;
  }): Promise<void> {
    const integrationsBaseUrl = String(process.env.INTEGRATIONS_BASE_URL || '').trim();
    const integrationsApiKey = String(process.env.INTEGRATIONS_API_KEY || '').trim();
    const recipientsCsv = String(process.env.BILLING_LIQUIDATION_NOTIFY_TO || 'admin@siriscloud.com.co').trim();

    if (!integrationsBaseUrl || !integrationsApiKey) {
      this.logger.warn('No hay INTEGRATIONS_BASE_URL/INTEGRATIONS_API_KEY para notificación de liquidación');
      return;
    }

    const recipients = Array.from(new Set(recipientsCsv.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean)));
    if (!recipients.length) return;

    const integrationsBase = integrationsBaseUrl.replace(/\/$/, '');
    const integrationsPath = '/email/liquidation-notice';
    const integrationsUrl = integrationsBase.endsWith('/api')
      ? `${integrationsBase}${integrationsPath}`
      : `${integrationsBase}/api${integrationsPath}`;

    const resp = await fetch(integrationsUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': integrationsApiKey,
      },
      body: JSON.stringify({
        recipients,
        tenantId: input.tenantId,
        liquidationId: input.liquidationId,
        userId: input.userId,
        cutoffDate: input.cutoffDate,
        totalDocuments: input.totalDocuments,
        totalPages: input.totalPages,
        totalAmount: input.totalAmount,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      this.logger.error(`Error enviando notificación de liquidación ${input.liquidationId}: ${resp.status} ${text}`);
      return;
    }

    this.logger.log(`Notificación de liquidación enviada id=${input.liquidationId} recipients=${recipients.length}`);
  }

  private async getOrCreateConfig(tenantId: string): Promise<BillingConfig> {
    const tid = String(tenantId || '').trim() || 'default-tenant';

    let config = await this.billingConfigRepo.findOne({ where: { tenantId: tid } });
    if (config) return config;

    config = this.billingConfigRepo.create({
      tenantId: tid,
      budgetLimitPages: 200_000,
      warningPercent: 80,
      criticalPercent: 100,
      lastWarningNotifiedPeriod: null,
      lastCriticalNotifiedPeriod: null,
      updatedAt: new Date(),
    });

    return this.billingConfigRepo.save(config);
  }

  private async runUsageAlertsJob(): Promise<void> {
    const configs = await this.billingConfigRepo.find();
    if (!configs.length) return;

    const now = new Date();
    const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const totalsRaw = await this.billingRepo
      .createQueryBuilder('b')
      .select('COALESCE(SUM(b.extractedPages), 0)', 'totalPages')
      .where('b.createdAt >= :start AND b.createdAt <= :end', {
        start: startOfMonth,
        end: endOfMonth,
      })
      .getRawOne();

    const usedPages = parseInt(totalsRaw?.totalPages || '0', 10) || 0;

    for (const config of configs) {
      const limitPages = Math.max(1, Number(config.budgetLimitPages || 1));
      const usagePercent = (usedPages / limitPages) * 100;

      if (
        usagePercent >= Number(config.criticalPercent || 100) &&
        config.lastCriticalNotifiedPeriod !== periodKey
      ) {
        const ok = await this.sendUsageAlertNotification({
          tenantId: config.tenantId,
          period: periodKey,
          severity: 'critical',
          threshold: Number(config.criticalPercent || 100),
          usagePercent,
          usedPages,
          limitPages,
        });

        if (ok) {
          config.lastCriticalNotifiedPeriod = periodKey;
          if (!config.lastWarningNotifiedPeriod) {
            config.lastWarningNotifiedPeriod = periodKey;
          }
          config.updatedAt = new Date();
          await this.billingConfigRepo.save(config);
        }

        continue;
      }

      if (
        usagePercent >= Number(config.warningPercent || 80) &&
        config.lastWarningNotifiedPeriod !== periodKey
      ) {
        const ok = await this.sendUsageAlertNotification({
          tenantId: config.tenantId,
          period: periodKey,
          severity: 'warning',
          threshold: Number(config.warningPercent || 80),
          usagePercent,
          usedPages,
          limitPages,
        });

        if (ok) {
          config.lastWarningNotifiedPeriod = periodKey;
          config.updatedAt = new Date();
          await this.billingConfigRepo.save(config);
        }
      }
    }
  }

  private async sendUsageAlertNotification(input: {
    tenantId: string;
    period: string;
    severity: 'warning' | 'critical';
    threshold: number;
    usagePercent: number;
    usedPages: number;
    limitPages: number;
  }): Promise<boolean> {
    const authBaseUrl = String(process.env.AUTH_BASE_URL || '').trim();
    const authInternalKey = String(process.env.AUTH_INTERNAL_API_KEY || '').trim();
    const integrationsBaseUrl = String(process.env.INTEGRATIONS_BASE_URL || '').trim();
    const integrationsApiKey = String(process.env.INTEGRATIONS_API_KEY || '').trim();

    if (!authBaseUrl || !authInternalKey || !integrationsBaseUrl || !integrationsApiKey) {
      this.logger.warn('Variables faltantes para enviar alertas (AUTH_BASE_URL, AUTH_INTERNAL_API_KEY, INTEGRATIONS_BASE_URL, INTEGRATIONS_API_KEY)');
      return false;
    }

    const authBase = authBaseUrl.replace(/\/$/, '');
    const authInternalPath = `/auth/internal/tenants/${encodeURIComponent(input.tenantId)}/users-emails`;
    const authUrl = authBase.endsWith('/api')
      ? `${authBase}${authInternalPath}`
      : `${authBase}/api${authInternalPath}`;

    const usersResp = await fetch(authUrl, {
      method: 'GET',
      headers: {
        'x-internal-key': authInternalKey,
      },
    });

    if (!usersResp.ok) {
      const text = await usersResp.text().catch(() => '');
      this.logger.error(`No se pudieron obtener usuarios del tenant ${input.tenantId}: ${usersResp.status} ${text}`);
      return false;
    }

    const usersJson: any = await usersResp.json().catch(() => ({ emails: [] }));
    const tenantName = String(usersJson?.tenantName || '').trim();
    const recipients = Array.from(
      new Set((usersJson?.emails || []).map((x: any) => String(x || '').trim().toLowerCase()).filter(Boolean)),
    );

    if (!recipients.length) {
      this.logger.warn(`Tenant ${input.tenantId} sin correos para alertas`);
      return false;
    }

    const integrationsBase = integrationsBaseUrl.replace(/\/$/, '');
    const integrationsPath = '/email/usage-alert';
    const integrationsUrl = integrationsBase.endsWith('/api')
      ? `${integrationsBase}${integrationsPath}`
      : `${integrationsBase}/api${integrationsPath}`;

    const sendResp = await fetch(integrationsUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': integrationsApiKey,
      },
      body: JSON.stringify({
        recipients,
        tenantId: input.tenantId,
        tenantName,
        period: input.period,
        usagePercent: input.usagePercent,
        threshold: input.threshold,
        severity: input.severity,
        usedPages: input.usedPages,
        limitPages: input.limitPages,
      }),
    });

    if (!sendResp.ok) {
      const text = await sendResp.text().catch(() => '');
      this.logger.error(`Error enviando alerta ${input.severity} tenant ${input.tenantId}: ${sendResp.status} ${text}`);
      return false;
    }

    this.logger.log(
      `Alerta ${input.severity} enviada tenant=${input.tenantId} percent=${input.usagePercent.toFixed(2)} threshold=${input.threshold}`,
    );

    return true;
  }

  async exportCsv(): Promise<string> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const records = await this.billingRepo.find({
      where: {
        createdAt: Between(startOfMonth, endOfMonth),
      },
      order: { createdAt: 'DESC' },
    });

    const header = 'id,document_id,filename,extracted_pages,created_at';
    const rows = records.map((r) => {
      const filename = (r.filename ?? '').replace(/"/g, '""');
      const docId = (r.documentId ?? '').replace(/"/g, '""');
      const date = r.createdAt?.toISOString() ?? '';
      return `${r.id},"${docId}","${filename}",${r.extractedPages ?? 0},${date}`;
    });

    return [header, ...rows].join('\n');
  }

  async getDailyDetail(date: string, page = 1, limit = 20): Promise<DailyDetail> {
    const dayStart = new Date(date + 'T00:00:00Z');
    const dayEnd = new Date(date + 'T23:59:59.999Z');

    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;

    const [records, total] = await this.billingRepo.findAndCount({
      where: {
        createdAt: Between(dayStart, dayEnd),
      },
      order: { createdAt: 'DESC' },
      skip,
      take: safeLimit,
    });

    return {
      date,
      records: records.map((r) => ({
        id: r.id,
        documentId: r.documentId,
        filename: r.filename,
        pages: r.extractedPages ?? 0,
        createdAt: r.createdAt?.toISOString() ?? '',
      })),
      pagination: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }
}
