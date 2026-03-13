#!/usr/bin/env tsx

import { DataSource } from 'typeorm';
import { env } from '../src/config/env';

async function fixNullData() {
  console.log('🔧 DB 연결 및 null 데이터 수정...');

  const dataSource = new DataSource({
    type: 'postgres',
    url: env.databaseUrl || undefined,
    host: env.databaseHost || undefined,
    port: env.databasePort,
    username: env.databaseUser || undefined,
    password: env.databasePassword || undefined,
    database: env.databaseName || undefined,
    ssl: env.databaseRequireTLS ? {
      rejectUnauthorized: env.databaseRejectUnauthorized
    } : false,
    synchronize: false,
    logging: true,
  });

  try {
    await dataSource.initialize();
    console.log('✅ DB 연결 성공');

    console.log('\n🔍 문제 있는 데이터 확인 중...');

    // 1. country_name_kr이 null인 레코드 확인
    const nullCountryNameRecords = await dataSource.query(`
      SELECT id, title, country_code, country_name_kr
      FROM travels
      WHERE country_name_kr IS NULL
    `);
    console.log(`📊 country_name_kr이 null인 레코드: ${nullCountryNameRecords.length}개`);

    // 2. created_at이 null인 레코드 확인
    const nullCreatedAtRecords = await dataSource.query(`
      SELECT id, title, created_at
      FROM travels
      WHERE created_at IS NULL
    `);
    console.log(`📊 created_at이 null인 레코드: ${nullCreatedAtRecords.length}개`);

    // 3. country_currencies가 비어있거나 null인 레코드 확인
    const emptyCountryCurrenciesRecords = await dataSource.query(`
      SELECT id, title, country_code, country_currencies
      FROM travels
      WHERE country_currencies IS NULL OR country_currencies = '' OR country_currencies = '[]'
    `);
    console.log(`📊 country_currencies가 비어있는 레코드: ${emptyCountryCurrenciesRecords.length}개`);

    console.log('\n🛠️ 데이터 수정 시작...');

    // 1. country_name_kr 수정 - country_code 기반으로 한국어명 설정
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

    let updatedCount = 0;
    for (const [countryCode, countryName] of Object.entries(countryMapping)) {
      const result = await dataSource.query(`
        UPDATE travels
        SET country_name_kr = $1, updated_at = NOW()
        WHERE country_code = $2 AND country_name_kr IS NULL
      `, [countryName, countryCode]);

      if (result[1] > 0) {
        console.log(`   ✅ ${countryCode} → ${countryName}: ${result[1]}개 업데이트`);
        updatedCount += result[1];
      }
    }
    console.log(`📈 총 ${updatedCount}개 country_name_kr 업데이트 완료`);

    // 2. created_at 수정 - null인 경우 현재 시간으로 설정
    const createdAtResult = await dataSource.query(`
      UPDATE travels
      SET created_at = NOW(), updated_at = NOW()
      WHERE created_at IS NULL
    `);
    console.log(`📈 ${createdAtResult[1]}개 created_at 업데이트 완료`);

    // 3. country_currencies 수정 - country_code 기반으로 통화 설정
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

    let currencyUpdatedCount = 0;
    for (const [countryCode, currencies] of Object.entries(currencyMapping)) {
      const currencyJson = JSON.stringify(currencies);
      const result = await dataSource.query(`
        UPDATE travels
        SET country_currencies = $1, updated_at = NOW()
        WHERE country_code = $2 AND (country_currencies IS NULL OR country_currencies = '' OR country_currencies = '[]')
      `, [currencyJson, countryCode]);

      if (result[1] > 0) {
        console.log(`   ✅ ${countryCode} → ${currencyJson}: ${result[1]}개 업데이트`);
        currencyUpdatedCount += result[1];
      }
    }
    console.log(`📈 총 ${currencyUpdatedCount}개 country_currencies 업데이트 완료`);

    // 최종 확인
    console.log('\n🔍 수정 후 데이터 확인...');
    const finalCheck = await dataSource.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN country_name_kr IS NULL THEN 1 END) as null_country_name,
        COUNT(CASE WHEN created_at IS NULL THEN 1 END) as null_created_at,
        COUNT(CASE WHEN country_currencies IS NULL OR country_currencies = '' OR country_currencies = '[]' THEN 1 END) as empty_currencies
      FROM travels
    `);

    console.log('📊 최종 상태:');
    console.log(`   전체 레코드: ${finalCheck[0].total}개`);
    console.log(`   country_name_kr null: ${finalCheck[0].null_country_name}개`);
    console.log(`   created_at null: ${finalCheck[0].null_created_at}개`);
    console.log(`   country_currencies 비어있음: ${finalCheck[0].empty_currencies}개`);

  } catch (error) {
    console.error('❌ 오류 발생:', error);
  } finally {
    await dataSource.destroy();
    console.log('✅ DB 연결 종료');
  }
}

fixNullData().catch(console.error);