import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'billing_liquidation', schema: 'public' })
export class BillingLiquidation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'tenant_id', type: 'varchar' })
  tenantId: string;

  @Column({ name: 'cutoff_date', type: 'timestamp' })
  cutoffDate: Date;

  @Column({ name: 'total_documents', type: 'int', default: 0 })
  totalDocuments: number;

  @Column({ name: 'total_pages', type: 'int', default: 0 })
  totalPages: number;

  @Column({ name: 'tier1_pages', type: 'int', default: 0 })
  tier1Pages: number;

  @Column({ name: 'tier1_rate', type: 'int', default: 80 })
  tier1Rate: number;

  @Column({ name: 'tier1_amount', type: 'bigint', default: 0 })
  tier1Amount: number;

  @Column({ name: 'tier2_pages', type: 'int', default: 0 })
  tier2Pages: number;

  @Column({ name: 'tier2_rate', type: 'int', default: 60 })
  tier2Rate: number;

  @Column({ name: 'tier2_amount', type: 'bigint', default: 0 })
  tier2Amount: number;

  @Column({ name: 'total_amount', type: 'bigint', default: 0 })
  totalAmount: number;

  @Column({ name: 'status', type: 'varchar', default: 'pending_pay' })
  status: 'pending_pay' | 'pay';

  @Column({ name: 'created_by', type: 'varchar' })
  createdBy: string;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'paid_at', type: 'timestamp', nullable: true })
  paidAt: Date | null;
}
