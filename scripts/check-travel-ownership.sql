-- 문제가 있는 travel의 ownership과 membership 확인
-- Travel ID: 92c2de91-383e-4e5a-9e88-93a4ea0a342b

-- 1. 해당 travel의 기본 정보
SELECT
  id,
  title,
  owner_id,
  country_code,
  country_name_kr,
  created_at,
  country_currencies,
  base_currency
FROM travels
WHERE id = '92c2de91-383e-4e5a-9e88-93a4ea0a342b';

-- 2. 해당 travel의 멤버들 (소유자 포함)
SELECT
  tm.travel_id,
  tm.user_id,
  tm.role,
  p.name as user_name,
  p.email as user_email
FROM travel_members tm
LEFT JOIN profiles p ON p.id = tm.user_id
WHERE tm.travel_id = '92c2de91-383e-4e5a-9e88-93a4ea0a342b';

-- 3. 전체 travels 테이블에서 null 데이터 확인
SELECT
  COUNT(*) as total_travels,
  COUNT(CASE WHEN country_name_kr IS NULL THEN 1 END) as null_country_name,
  COUNT(CASE WHEN created_at IS NULL THEN 1 END) as null_created_at,
  COUNT(CASE WHEN country_currencies IS NULL OR country_currencies = '' OR country_currencies = '[]' THEN 1 END) as empty_currencies
FROM travels;

-- 4. owner가 member에도 포함되지 않은 케이스 확인
SELECT
  t.id,
  t.title,
  t.owner_id,
  CASE WHEN tm.user_id IS NULL THEN 'MISSING' ELSE 'EXISTS' END as owner_in_members
FROM travels t
LEFT JOIN travel_members tm ON (tm.travel_id = t.id AND tm.user_id = t.owner_id)
WHERE tm.user_id IS NULL
LIMIT 5;