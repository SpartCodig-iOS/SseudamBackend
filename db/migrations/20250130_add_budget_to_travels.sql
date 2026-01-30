-- Add budget field to travels table as optional field
-- Budget is stored as integer (in cents/minor unit) to avoid floating point precision issues
ALTER TABLE travels
ADD COLUMN budget BIGINT NULL,
ADD COLUMN budget_currency VARCHAR(3) NULL;

-- Add comment for documentation
COMMENT ON COLUMN travels.budget IS 'Travel budget in minor currency units (e.g., cents for USD, won for KRW)';
COMMENT ON COLUMN travels.budget_currency IS 'ISO 4217 currency code for the budget (e.g., USD, KRW)';

-- Index for budget queries (optional, for future analytics)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_travels_budget
    ON travels (budget)
    WHERE budget IS NOT NULL;