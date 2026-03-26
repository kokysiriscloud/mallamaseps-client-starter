import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity({ name: 'request_logs' })
export class RequestLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  model: string;

  @Column({ name: 'tokens_consumed', type: 'int', default: 0 })
  tokensConsumed: number;

  @Column({ name: 'response_ms', type: 'int', default: 0 })
  responseMs: number;

  @Column({ default: 'ok', length: 20 })
  status: string;

  @Column({ name: 'tenant_id', type: 'varchar', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
