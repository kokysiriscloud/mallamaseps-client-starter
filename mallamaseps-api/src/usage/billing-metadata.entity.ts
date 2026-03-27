import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'billing_metadata', schema: 'public', synchronize: false })
export class BillingMetadata {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'document_id', type: 'varchar', nullable: true })
  documentId: string | null;

  @Column({ name: 'filename', type: 'varchar', nullable: true })
  filename: string | null;

  @Column({ name: 'azure_model_id', type: 'varchar', nullable: true })
  azureModelId: string | null;

  @Column({ name: 'extracted_pages', type: 'int', nullable: true })
  extractedPages: number | null;

  @Column({ name: 'tokens_input', type: 'int', nullable: true })
  tokensInput: number | null;

  @Column({ name: 'tokens_output', type: 'int', nullable: true })
  tokensOutput: number | null;

  @Column({ name: 'openai_tokens', type: 'int', nullable: true })
  openaiTokens: number | null;

  @Column({ name: 'processed_authorizations', type: 'int', nullable: true })
  processedAuthorizations: number | null;

  @Column({ name: 'billing_status', type: 'varchar', nullable: true })
  billingStatus: 'unbilled' | 'pending_pay' | 'pay' | null;

  @Column({ name: 'billing_id', type: 'int', nullable: true })
  billingId: number | null;

  @Column({ name: 'billing_marked_at', type: 'timestamp', nullable: true })
  billingMarkedAt: Date | null;

  @Column({ name: 'billing_marked_by', type: 'varchar', nullable: true })
  billingMarkedBy: string | null;

  @Column({ name: 'created_at', type: 'timestamp', nullable: true })
  createdAt: Date | null;
}
