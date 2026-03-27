import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'billing_rate_config', schema: 'public' })
export class BillingRateConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'tenant_id', type: 'varchar' })
  tenantId: string;

  @Column({ name: 'tier1_limit_pages', type: 'int', default: 1000000 })
  tier1LimitPages: number;

  @Column({ name: 'tier1_rate', type: 'int', default: 80 })
  tier1Rate: number;

  @Column({ name: 'tier2_rate', type: 'int', default: 60 })
  tier2Rate: number;

  @Column({ name: 'effective_from', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  effectiveFrom: Date;

  @Column({ name: 'effective_to', type: 'timestamp', nullable: true })
  effectiveTo: Date | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_by', type: 'varchar', nullable: true })
  createdBy: string | null;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
