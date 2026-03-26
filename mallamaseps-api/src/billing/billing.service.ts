import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { BillingMetadata } from '../usage/billing-metadata.entity';

export interface DailyUsage {
  date: string;       // YYYY-MM-DD
  documents: number;
  pages: number;
}

export interface BillingSummary {
  period: string;
  totalDocuments: number;
  totalPages: number;
  budget: { limit: number; used: number; spent: number; budgetCap: number; costPerPage: number; resetsIn: number };
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
        limit: 200000,         // page limit — placeholder
        used: totalPages,
        ...this.calculateCost(totalPages, 200000),
        resetsIn,
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
