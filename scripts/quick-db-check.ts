#!/usr/bin/env tsx

import { createDataSourceConfig } from '../src/config/database.config';
import { DataSource } from 'typeorm';

async function quickDbCheck() {
  console.log('🚀 실제 앱 설정으로 DB 확인...');

  try {
    const config = await createDataSourceConfig();
    const dataSource = new DataSource(config);

    await dataSource.initialize();
    console.log('✅ DB 연결 성공!');

    // 1. 문제가 있는 특정 travel 확인
    console.log('\n🔍 문제 Travel 확인:');
    const problemTravel = await dataSource.query(`
      SELECT
        t.id,
        t.title,
        t.owner_id,
        t.country_code,
        t.country_name_kr,
        t.created_at,
        t.country_currencies,
        t.base_currency,
        tm.user_id as owner_in_members
      FROM travels t
      LEFT JOIN travel_members tm ON (tm.travel_id = t.id AND tm.user_id = t.owner_id)
      WHERE t.id = '92c2de91-383e-4e5a-9e88-93a4ea0a342b'
    `);

    if (problemTravel.length > 0) {
      const travel = problemTravel[0];
      console.log(`📋 제목: "${travel.title}"`);
      console.log(`🆔 ID: ${travel.id}`);
      console.log(`👤 소유자: ${travel.owner_id}`);
      console.log(`👥 소유자가 멤버임: ${travel.owner_in_members ? '✅' : '❌'}`);
      console.log(`🏳️ country_code: "${travel.country_code}"`);
      console.log(`🏳️ country_name_kr: ${travel.country_name_kr ? `"${travel.country_name_kr}"` : '❌ NULL'}`);
      console.log(`📅 created_at: ${travel.created_at || '❌ NULL'}`);
      console.log(`💰 country_currencies: ${travel.country_currencies || '❌ NULL/EMPTY'}`);
    }

    // 2. 해당 travel의 멤버들 확인
    console.log('\n👥 Travel 멤버들:');
    const members = await dataSource.query(`
      SELECT
        tm.user_id,
        tm.role,
        p.name,
        p.email
      FROM travel_members tm
      LEFT JOIN profiles p ON p.id = tm.user_id
      WHERE tm.travel_id = '92c2de91-383e-4e5a-9e88-93a4ea0a342b'
    `);

    members.forEach((member: any) => {
      console.log(`  - ${member.name || '이름없음'} (${member.user_id}) [${member.role}]`);
    });

    // 3. 전체 null 데이터 통계
    console.log('\n📊 전체 Travels 상태:');
    const stats = await dataSource.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN country_name_kr IS NULL THEN 1 END) as null_country_name,
        COUNT(CASE WHEN created_at IS NULL THEN 1 END) as null_created_at,
        COUNT(CASE WHEN country_currencies IS NULL OR country_currencies = '' OR country_currencies = '[]' THEN 1 END) as empty_currencies
      FROM travels
    `);

    const stat = stats[0];
    console.log(`전체: ${stat.total}개`);
    console.log(`country_name_kr NULL: ${stat.null_country_name}개`);
    console.log(`created_at NULL: ${stat.null_created_at}개`);
    console.log(`country_currencies 빈값: ${stat.empty_currencies}개`);

    await dataSource.destroy();

  } catch (error) {
    console.error('❌ DB 연결 실패:', error);
  }
}

quickDbCheck().catch(console.error);