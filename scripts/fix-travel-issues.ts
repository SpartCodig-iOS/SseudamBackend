#!/usr/bin/env tsx

import { DataSource } from 'typeorm';
import { env } from '../src/config/env';

async function fixTravelIssues() {
  console.log('🔧 여행 데이터 및 권한 문제 수정...');

  const dataSource = new DataSource({
    type: 'postgres',
    url: env.databaseUrl || undefined,
    host: env.databaseHost || undefined,
    port: env.databasePort,
    username: env.databaseUser || undefined,
    password: env.databasePassword || undefined,
    database: env.databaseName || undefined,
    ssl: env.databaseUrl?.includes('railway.app') || env.databaseUrl?.includes('supabase') ? {
      rejectUnauthorized: false  // Railway/Supabase는 self-signed 인증서 허용
    } : false,
    synchronize: false,
    logging: true,
  });

  try {
    await dataSource.initialize();
    console.log('✅ DB 연결 성공');

    // 1. 문제가 있는 특정 travel 확인
    const specificTravel = await dataSource.query(`
      SELECT
        t.id,
        t.title,
        t.owner_id,
        t.country_code,
        t.country_name_kr,
        t.created_at,
        t.country_currencies,
        t.base_currency,
        tm.user_id as member_exists
      FROM travels t
      LEFT JOIN travel_members tm ON (tm.travel_id = t.id AND tm.user_id = t.owner_id)
      WHERE t.id = '92c2de91-383e-4e5a-9e88-93a4ea0a342b'
    `);

    console.log('\n🔍 문제 travel 분석:');
    if (specificTravel.length > 0) {
      const travel = specificTravel[0];
      console.log(`📋 제목: ${travel.title}`);
      console.log(`👤 소유자: ${travel.owner_id}`);
      console.log(`👥 소유자가 멤버에 포함됨: ${travel.member_exists ? '✅' : '❌'}`);
      console.log(`🏳️ country_name_kr: ${travel.country_name_kr || '❌ NULL'}`);
      console.log(`📅 created_at: ${travel.created_at || '❌ NULL'}`);
      console.log(`💰 country_currencies: ${travel.country_currencies || '❌ NULL/EMPTY'}`);

      // 2. 소유자가 멤버에 없는 경우 추가
      if (!travel.member_exists) {
        console.log('\n🚨 소유자가 travel_members에 없음! 추가 중...');
        await dataSource.query(`
          INSERT INTO travel_members (travel_id, user_id, role, joined_at, updated_at)
          VALUES ($1, $2, 'owner', NOW(), NOW())
          ON CONFLICT (travel_id, user_id) DO NOTHING
        `, [travel.id, travel.owner_id]);
        console.log('✅ 소유자를 travel_members에 추가 완료');
      }
    } else {
      console.log('❌ 해당 travel을 찾을 수 없습니다.');
      return;
    }

    // 3. 전체 travels에서 소유자가 멤버에 없는 케이스 수정
    console.log('\n🔧 전체 travels 권한 문제 수정...');
    const orphanOwners = await dataSource.query(`
      SELECT t.id, t.owner_id, t.title
      FROM travels t
      LEFT JOIN travel_members tm ON (tm.travel_id = t.id AND tm.user_id = t.owner_id)
      WHERE tm.user_id IS NULL
    `);

    console.log(`📊 소유자가 멤버에 없는 travel: ${orphanOwners.length}개`);

    for (const travel of orphanOwners) {
      await dataSource.query(`
        INSERT INTO travel_members (travel_id, user_id, role, joined_at, updated_at)
        VALUES ($1, $2, 'owner', NOW(), NOW())
        ON CONFLICT (travel_id, user_id) DO NOTHING
      `, [travel.id, travel.owner_id]);
      console.log(`  ✅ ${travel.title} 소유자 추가: ${travel.owner_id}`);
    }

    // 4. NULL 데이터 수정 (country_name_kr, created_at, country_currencies)
    console.log('\n🛠️ NULL 데이터 수정...');

    // country_name_kr 수정
    const countryMapping: Record<string, string> = {
      'JP': '일본',
      'KR': '한국',
      'US': '미국',
      'CN': '중국',
      'TH': '태국',
      'VN': '베트남',
      'PH': '필리핀',
      'SG': '싱가포르',
      'MY': '말레이시아',
      'ID': '인도네시아',
      'TW': '대만',
      'HK': '홍콩',
      'GB': '영국',
      'FR': '프랑스',
      'DE': '독일',
      'IT': '이탈리아',
      'ES': '스페인',
      'AU': '호주',
      'CA': '캐나다'
    };

    let countryNameUpdated = 0;
    for (const [code, name] of Object.entries(countryMapping)) {
      const result = await dataSource.query(`
        UPDATE travels
        SET country_name_kr = $1, updated_at = NOW()
        WHERE country_code = $2 AND country_name_kr IS NULL
      `, [name, code]);
      countryNameUpdated += result[1];
    }
    console.log(`📈 country_name_kr 업데이트: ${countryNameUpdated}개`);

    // created_at 수정
    const createdAtResult = await dataSource.query(`
      UPDATE travels
      SET created_at = NOW(), updated_at = NOW()
      WHERE created_at IS NULL
    `);
    console.log(`📈 created_at 업데이트: ${createdAtResult[1]}개`);

    // country_currencies 수정
    const currencyMapping: Record<string, string[]> = {
      'JP': ['JPY'],
      'KR': ['KRW'],
      'US': ['USD'],
      'CN': ['CNY'],
      'TH': ['THB'],
      'VN': ['VND'],
      'PH': ['PHP'],
      'SG': ['SGD'],
      'MY': ['MYR'],
      'ID': ['IDR'],
      'TW': ['TWD'],
      'HK': ['HKD'],
      'GB': ['GBP'],
      'FR': ['EUR'],
      'DE': ['EUR'],
      'IT': ['EUR'],
      'ES': ['EUR'],
      'AU': ['AUD'],
      'CA': ['CAD']
    };

    let currencyUpdated = 0;
    for (const [code, currencies] of Object.entries(currencyMapping)) {
      const currencyJson = JSON.stringify(currencies);
      const result = await dataSource.query(`
        UPDATE travels
        SET country_currencies = $1, updated_at = NOW()
        WHERE country_code = $2 AND (country_currencies IS NULL OR country_currencies = '' OR country_currencies = '[]')
      `, [currencyJson, code]);
      currencyUpdated += result[1];
    }
    console.log(`📈 country_currencies 업데이트: ${currencyUpdated}개`);

    // 5. 최종 검증
    console.log('\n✅ 수정 완료 - 최종 상태 확인:');
    const finalCheck = await dataSource.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN country_name_kr IS NULL THEN 1 END) as null_country_name,
        COUNT(CASE WHEN created_at IS NULL THEN 1 END) as null_created_at,
        COUNT(CASE WHEN country_currencies IS NULL OR country_currencies = '' OR country_currencies = '[]' THEN 1 END) as empty_currencies
      FROM travels
    `);

    const ownershipCheck = await dataSource.query(`
      SELECT COUNT(*) as orphan_owners
      FROM travels t
      LEFT JOIN travel_members tm ON (tm.travel_id = t.id AND tm.user_id = t.owner_id)
      WHERE tm.user_id IS NULL
    `);

    console.log(`📊 전체 travels: ${finalCheck[0].total}개`);
    console.log(`❌ country_name_kr NULL: ${finalCheck[0].null_country_name}개`);
    console.log(`❌ created_at NULL: ${finalCheck[0].null_created_at}개`);
    console.log(`❌ country_currencies 빈값: ${finalCheck[0].empty_currencies}개`);
    console.log(`❌ 소유자가 멤버에 없는 travel: ${ownershipCheck[0].orphan_owners}개`);

  } catch (error) {
    console.error('❌ 오류 발생:', error);
  } finally {
    await dataSource.destroy();
  }
}

fixTravelIssues().catch(console.error);