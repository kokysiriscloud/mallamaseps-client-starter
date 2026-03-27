-- 002_billing_liquidations_and_rates.sql
-- Campos nuevos en billing_metadata + tablas billing_liquidation y billing_rate_config

BEGIN;

ALTER TABLE IF EXISTS public.billing_metadata
  ADD COLUMN IF NOT EXISTS billing_status varchar NULL,
  ADD COLUMN IF NOT EXISTS billing_id int NULL,
  ADD COLUMN IF NOT EXISTS billing_marked_at timestamp NULL,
  ADD COLUMN IF NOT EXISTS billing_marked_by varchar NULL;

UPDATE public.billing_metadata
SET billing_status = 'unbilled'
WHERE billing_status IS NULL;

CREATE TABLE IF NOT EXISTS public.billing_liquidation (
  id serial PRIMARY KEY,
  tenant_id varchar NOT NULL,
  cutoff_date timestamp NOT NULL,
  total_documents int NOT NULL DEFAULT 0,
  total_pages int NOT NULL DEFAULT 0,
  tier1_pages int NOT NULL DEFAULT 0,
  tier1_rate int NOT NULL DEFAULT 80,
  tier1_amount bigint NOT NULL DEFAULT 0,
  tier2_pages int NOT NULL DEFAULT 0,
  tier2_rate int NOT NULL DEFAULT 60,
  tier2_amount bigint NOT NULL DEFAULT 0,
  total_amount bigint NOT NULL DEFAULT 0,
  status varchar NOT NULL DEFAULT 'pending_pay',
  created_by varchar NOT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at timestamp NULL
);

CREATE INDEX IF NOT EXISTS idx_billing_liquidation_tenant_created_at
  ON public.billing_liquidation (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.billing_rate_config (
  id serial PRIMARY KEY,
  tenant_id varchar NOT NULL,
  tier1_limit_pages int NOT NULL DEFAULT 1000000,
  tier1_rate int NOT NULL DEFAULT 80,
  tier2_rate int NOT NULL DEFAULT 60,
  effective_from timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  effective_to timestamp NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by varchar NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_billing_rate_config_tenant_active
  ON public.billing_rate_config (tenant_id, is_active, effective_from DESC);

COMMIT;
