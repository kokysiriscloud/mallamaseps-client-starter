import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'tenant_billing_config', schema: 'public' })
export class BillingConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'tenant_id', type: 'varchar', unique: true })
  tenantId: string;

  @Column({ name: 'budget_limit_pages', type: 'int', default: 200000 })
  budgetLimitPages: number;

  @Column({ name: 'warning_percent', type: 'int', default: 80 })
  warningPercent: number;

  @Column({ name: 'critical_percent', type: 'int', default: 100 })
  criticalPercent: number;

  @Column({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
