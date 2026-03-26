import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillingMetadata } from './billing-metadata.entity';

export interface UsageSummary {
  period: string;
  summary: {
    totalDocuments: number;
    totalPages: number;
  };
  records: {
    id: number;
    documentId: string | null;
    filename: string | null;
    pages: number;
    createdAt: string;
  }[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

@Injectable()
export class UsageService {
  constructor(
    @InjectRepository(BillingMetadata)
    private readonly billingRepo: Repository<BillingMetadata>,
  ) {}

  async getSummary(page = 1, limit = 20): Promise<UsageSummary> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const period = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;

    const [summaryRaw, [records, total]] = await Promise.all([
      this.billingRepo
        .createQueryBuilder('b')
        .select('COUNT(*)', 'totalDocuments')
        .addSelect('COALESCE(SUM(b.extractedPages), 0)', 'totalPages')
        .where('b.createdAt >= :start AND b.createdAt <= :end', { start: startOfMonth, end: endOfMonth })
        .getRawOne(),

      this.billingRepo.findAndCount({
        order: { createdAt: 'DESC' },
        skip,
        take: safeLimit,
      }),
    ]);

    return {
      period,
      summary: {
        totalDocuments: parseInt(summaryRaw.totalDocuments, 10) || 0,
        totalPages: parseInt(summaryRaw.totalPages, 10) || 0,
      },
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
