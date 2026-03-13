#!/usr/bin/env tsx

import { DataSource } from 'typeorm';
import { env } from '../src/config/env';

async function checkTravelData() {
  console.log('🔍 DB 연결 및 travel 데이터 확인...');

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
    logging: false,
  });

  try {
    await dataSource.initialize();
    console.log('✅ DB 연결 성공');

    // travels 테이블 구조 확인
    const schema = await dataSource.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'travels'
      ORDER BY ordinal_position;
    `);

    console.log('\n📋 travels 테이블 스키마:');
    schema.forEach((col: any) => {
      console.log(`  ${col.column_name}: ${col.data_type} ${col.is_nullable === 'YES' ? '(nullable)' : '(not null)'} ${col.column_default ? `default: ${col.column_default}` : ''}`);
    });

    // 실제 데이터 확인
    const travels = await dataSource.query(`
      SELECT
        id,
        title,
        country_code,
        country_name_kr,
        created_at,
        country_currencies,
        base_currency,
        base_exchange_rate
      FROM travels
      ORDER BY created_at DESC
      LIMIT 5;
    `);

    console.log('\n📦 실제 travel 데이터:');
    travels.forEach((travel: any, index: number) => {
      console.log(`\n${index + 1}. ${travel.title} (${travel.id})`);
      console.log(`   country_code: ${travel.country_code}`);
      console.log(`   country_name_kr: ${travel.country_name_kr}`);
      console.log(`   created_at: ${travel.created_at}`);
      console.log(`   country_currencies: ${JSON.stringify(travel.country_currencies)}`);
      console.log(`   base_currency: ${travel.base_currency}`);
      console.log(`   base_exchange_rate: ${travel.base_exchange_rate}`);
    });

    // 특정 문제가 있는 travel 확인
    const problemTravel = await dataSource.query(`
      SELECT * FROM travels
      WHERE id = '92c2de91-383e-4e5a-9e88-93a4ea0a342b'
    `);

    if (problemTravel.length > 0) {
      console.log('\n🚨 문제가 있는 travel 데이터:');
      const travel = problemTravel[0];
      Object.keys(travel).forEach(key => {
        console.log(`   ${key}: ${travel[key]}`);
      });
    }

  } catch (error) {
    console.error('❌ DB 연결 또는 조회 실패:', error);
  } finally {
    await dataSource.destroy();
  }
}

checkTravelData().catch(console.error);