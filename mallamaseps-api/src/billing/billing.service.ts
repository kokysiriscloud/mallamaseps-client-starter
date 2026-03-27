import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { BillingMetadata } from '../usage/billing-metadata.entity';
import { BillingConfig } from './billing-config.entity';

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

@Injectable()
export class BillingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('BillingService');
  private alertsInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(BillingMetadata)
    private readonly billingRepo: Repository<BillingMetadata>,
    @InjectRepository(BillingConfig)
    private readonly billingConfigRepo: Repository<BillingConfig>,
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

    return {
      period,
      totalDocuments,
      totalPages,
      budget: {
        limit: config.budgetLimitPages,
        used: totalPages,
        ...this.calculateCost(totalPages, config.budgetLimitPages),
        resetsIn,
      },
      alerts: {
        warningPercent: config.warningPercent,
        criticalPercent: config.criticalPercent,
      },
      daily,
    };
  }

  /**
   * Pricing tiers (COP per page):
   *   0 – 1,000,000  pages → $80
   *   1,000,000+      pages → $60
   */
  private calculateCost(
    totalPages: number,
    budgetLimitPages: number,
  ): { costPerPage: number; spent: number; budgetCap: number } {
    const TIER_1_LIMIT = 1_000_000;
    const TIER_1_PRICE = 80;   // COP per page
    const TIER_2_PRICE = 60;   // COP per page

    const calcCost = (pages: number): number => {
      if (pages <= TIER_1_LIMIT) {
        return pages * TIER_1_PRICE;
      }
      return TIER_1_LIMIT * TIER_1_PRICE + (pages - TIER_1_LIMIT) * TIER_2_PRICE;
    };

    const spent = calcCost(totalPages);
    const budgetCap = calcCost(budgetLimitPages);
    const costPerPage = totalPages <= TIER_1_LIMIT ? TIER_1_PRICE : TIER_2_PRICE;

    return { costPerPage, spent, budgetCap };
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

    return {
      limit: config.budgetLimitPages,
      used: totalPages,
      ...this.calculateCost(totalPages, config.budgetLimitPages),
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
