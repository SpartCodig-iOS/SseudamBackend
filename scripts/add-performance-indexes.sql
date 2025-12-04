-- Performance optimization indexes for SseuDam backend
-- 성능 최적화를 위한 인덱스 추가

-- 현재 인덱스 상황 확인 (실행 전 검토용)
-- SELECT schemaname, tablename, indexname, indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public' AND tablename IN ('travels', 'travel_expenses', 'travel_members', 'travel_expense_participants')
-- ORDER BY tablename, indexname;

-- 1. travel_expenses 테이블 최적화
-- 1-1. travel_id로 필터링하는 모든 쿼리 최적화
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_travel_expenses_travel_id
ON travel_expenses(travel_id);

-- 1-2. 날짜순 정렬 최적화 (expense_date DESC, created_at DESC)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_travel_expenses_date_created
ON travel_expenses(travel_id, expense_date DESC, created_at DESC);

-- 2. travel_expense_participants 테이블 최적화
-- 2-1. expense_id로 참여자 조회 최적화
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_travel_expense_participants_expense_id
ON travel_expense_participants(expense_id);

-- 2-2. member_id로 역방향 조회 최적화 (필요시)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_travel_expense_participants_member_id
ON travel_expense_participants(member_id);

-- 3. travel_members 테이블 최적화
-- 3-1. travel_id로 멤버 목록 조회 최적화
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_travel_members_travel_id
ON travel_members(travel_id);

-- 3-2. user_id로 사용자 여행 목록 조회 최적화
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_travel_members_user_id
ON travel_members(user_id);

-- 3-3. 멤버십 체크 최적화 (travel_id, user_id 복합)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_travel_members_travel_user
ON travel_members(travel_id, user_id);

-- 4. travels 테이블 최적화
-- 4-1. owner_id로 소유 여행 조회 최적화
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_travels_owner_id
ON travels(owner_id);

-- 4-2. end_date로 archived 상태 계산 최적화
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_travels_end_date
ON travels(end_date);

-- 5. travel_invites 테이블 최적화
-- 5-1. invite_code로 초대 코드 조회 최적화 (이미 있을 수 있음)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_travel_invites_invite_code
ON travel_invites(invite_code);

-- 5-2. travel_id로 여행의 초대 코드 조회 최적화
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_travel_invites_travel_id
ON travel_invites(travel_id);

-- 6. profiles 테이블 최적화 (JOIN 성능 향상)
-- 6-1. name으로 검색 최적화 (필요시)
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_name
-- ON profiles(name);

-- 인덱스 생성 완료 후 실행 (통계 업데이트)
ANALYZE travel_expenses;
ANALYZE travel_expense_participants;
ANALYZE travel_members;
ANALYZE travels;
ANALYZE travel_invites;

-- 인덱스 사용량 확인 쿼리 (나중에 모니터링용)
/*
SELECT
    schemaname,
    tablename,
    indexname,
    idx_tup_read,
    idx_tup_fetch,
    idx_scan
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
*/