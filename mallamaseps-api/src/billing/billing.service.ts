import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { BillingMetadata } from '../usage/billing-metadata.entity';

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
export class BillingService {
  // In-memory config (in production, store in a tenant_config table)
  private budgetLimitPages = 200_000;
  private alerts: UsageAlerts = { warningPercent: 80, criticalPercent: 100 };

  constructor(
    @InjectRepository(BillingMetadata)
    private readonly billingRepo: Repository<BillingMetadata>,
  ) {}

  async getSummary(): Promise<BillingSummary> {
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
        limit: this.budgetLimitPages,
        used: totalPages,
        ...this.calculateCost(totalPages, this.budgetLimitPages),
        resetsIn,
      },
      alerts: { ...this.alerts },
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

  async updateBudget(limit: number): Promise<BudgetInfo> {
    this.budgetLimitPages = Math.max(1, limit);

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
      limit: this.budgetLimitPages,
      used: totalPages,
      ...this.calculateCost(totalPages, this.budgetLimitPages),
      resetsIn,
    };
  }

  updateAlerts(alerts: UsageAlerts): UsageAlerts {
    this.alerts = {
      warningPercent: Math.max(1, Math.min(100, alerts.warningPercent)),
      criticalPercent: Math.max(1, Math.min(100, alerts.criticalPercent)),
    };
    // Ensure critical >= warning
    if (this.alerts.criticalPercent < this.alerts.warningPercent) {
      this.alerts.criticalPercent = this.alerts.warningPercent;
    }
    return { ...this.alerts };
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
