-- Budget fields migration for travels table
ALTER TABLE travels
ADD COLUMN IF NOT EXISTS budget BIGINT NULL,
ADD COLUMN IF NOT EXISTS budget_currency VARCHAR(3) NULL;

COMMENT ON COLUMN travels.budget IS 'Travel budget in minor currency units (e.g., cents for USD, won for KRW)';
COMMENT ON COLUMN travels.budget_currency IS 'ISO 4217 currency code for the budget (e.g., USD, KRW)';