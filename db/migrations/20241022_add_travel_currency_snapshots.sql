-- Snapshot travel currency info whenever a trip is created or updated.
-- Stores the travel's base currency, derived destination currency and exchange rate at that time.
CREATE TABLE IF NOT EXISTS travel_currency_snapshots (
    id BIGSERIAL PRIMARY KEY,
    travel_id UUID NOT NULL REFERENCES travels(id) ON DELETE CASCADE,
    base_currency VARCHAR(3) NOT NULL,
    destination_currency VARCHAR(3) NOT NULL,
    base_amount INTEGER NOT NULL DEFAULT 1000,
    base_exchange_rate NUMERIC(18, 6) NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_travel_currency_snapshots_travel_id
    ON travel_currency_snapshots (travel_id, recorded_at DESC);
