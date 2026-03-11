import test from 'node:test';
import assert from 'node:assert/strict';
import { BatchProcessor } from '../common/utils/batch-processor';

// ────────────────────────────────────────────────────────────
// BatchProcessor 단위 테스트
// ────────────────────────────────────────────────────────────

test('process: 빈 배열을 처리하면 빈 결과를 반환한다', async () => {
  const result = await BatchProcessor.process([], async () => []);

  assert.equal(result.totalItems, 0);
  assert.equal(result.processedItems, 0);
  assert.equal(result.failedItems, 0);
  assert.deepEqual(result.results, []);
  assert.deepEqual(result.errors, []);
});

test('process: 모든 항목이 처리되어 결과를 반환한다', async () => {
  const data = [1, 2, 3, 4, 5];
  const result = await BatchProcessor.process(
    data,
    async (chunk) => chunk.map((n) => n * 2),
    { chunkSize: 2 },
  );

  assert.equal(result.totalItems, 5);
  assert.equal(result.processedItems, 5);
  assert.equal(result.failedItems, 0);
  assert.equal(result.errors.length, 0);

  // 순서 보장을 위해 정렬 후 비교
  const sorted = [...result.results].sort((a, b) => a - b);
  assert.deepEqual(sorted, [2, 4, 6, 8, 10]);
});

test('process: chunkSize를 지정하면 올바르게 청크가 분할된다', async () => {
  const data = Array.from({ length: 10 }, (_, i) => i);
  const chunks: number[][] = [];

  await BatchProcessor.process(
    data,
    async (chunk, idx) => {
      chunks[idx] = chunk;
      return chunk;
    },
    { chunkSize: 3 },
  );

  // 10 items / 3 = 4 chunks (3,3,3,1)
  assert.equal(chunks.length, 4);
  assert.equal(chunks[0].length, 3);
  assert.equal(chunks[3].length, 1);
});

test('process: 특정 청크가 실패해도 나머지는 처리된다', async () => {
  const data = [1, 2, 3, 4, 5, 6];

  const result = await BatchProcessor.process(
    data,
    async (chunk, idx) => {
      if (idx === 1) throw new Error('chunk 1 failed');
      return chunk.map((n) => n * 10);
    },
    { chunkSize: 2, concurrency: 1 },
  );

  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].chunkIndex, 1);
  assert.ok(result.errors[0].error.message.includes('chunk 1 failed'));

  // 성공한 청크들의 결과가 포함되어야 한다
  assert.ok(result.results.length > 0);
  assert.ok(result.failedItems > 0);
});

test('process: 동시성(concurrency) 옵션이 동작한다', async () => {
  const data = Array.from({ length: 9 }, (_, i) => i);
  const concurrentCount = { max: 0, current: 0 };

  const result = await BatchProcessor.process(
    data,
    async (chunk) => {
      concurrentCount.current++;
      concurrentCount.max = Math.max(concurrentCount.max, concurrentCount.current);
      await new Promise((r) => setTimeout(r, 10));
      concurrentCount.current--;
      return chunk;
    },
    { chunkSize: 3, concurrency: 2 },
  );

  assert.equal(result.totalItems, 9);
  assert.equal(result.errors.length, 0);
  // 최대 동시 처리 수가 concurrency 이하여야 한다
  assert.ok(
    concurrentCount.max <= 2,
    `max concurrent chunks should be <= 2, got ${concurrentCount.max}`,
  );
});

test('process: retries 옵션으로 실패 시 재시도한다', async () => {
  const data = [1, 2, 3];
  let chunkAttempts = 0;

  const result = await BatchProcessor.process(
    data,
    async (chunk) => {
      chunkAttempts++;
      if (chunkAttempts < 3) throw new Error('transient error');
      return chunk.map((n) => n * 2);
    },
    { chunkSize: 10, retries: 2, retryDelayMs: 10 },
  );

  // 3번 시도 후 성공
  assert.equal(chunkAttempts, 3);
  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.results.sort((a, b) => a - b), [2, 4, 6]);
});

test('process: onProgress 콜백이 각 청크마다 호출된다', async () => {
  const data = Array.from({ length: 6 }, (_, i) => i);
  const progressEvents: number[] = [];

  await BatchProcessor.process(
    data,
    async (chunk) => chunk,
    {
      chunkSize: 2,
      concurrency: 1,
      onProgress: (p) => {
        progressEvents.push(p.processedChunks);
      },
    },
  );

  // 3개 청크 -> 3번의 progress 콜백
  assert.equal(progressEvents.length, 3);
  assert.deepEqual(progressEvents, [1, 2, 3]);
});

test('processStream: 결과를 청크 단위로 즉시 콜백한다', async () => {
  const data = Array.from({ length: 4 }, (_, i) => i);
  const streamedResults: number[][] = [];

  const summary = await BatchProcessor.processStream(
    data,
    async (chunk) => chunk.map((n) => n * 3),
    async (results) => {
      streamedResults.push(results);
    },
    { chunkSize: 2 },
  );

  assert.equal(summary.totalItems, 4);
  assert.equal(summary.processedChunks, 2);
  assert.equal(streamedResults.length, 2);
  assert.deepEqual(streamedResults[0], [0, 3]);
  assert.deepEqual(streamedResults[1], [6, 9]);
});
