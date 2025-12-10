ALTER TABLE travels
ADD COLUMN IF NOT EXISTS country_currencies TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

COMMENT ON COLUMN travels.country_currencies IS '해당 여행이 대상 국가에서 사용하는 통화들의 ISO 4217 코드 목록';
