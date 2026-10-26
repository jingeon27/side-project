import assert from 'node:assert/strict';

import { it as test } from 'vitest';

import { guardDatabaseUrl } from './database-guard';
import { developmentDatabaseUrl, testDatabaseUrl } from './env';

test('accepts only the dedicated development target', () => {
  assert.equal(guardDatabaseUrl(developmentDatabaseUrl).database, 'game_feedback');
  for (const url of [
    developmentDatabaseUrl.replace('game_feedback?', 'photo_contest?'),
    developmentDatabaseUrl.replace('127.0.0.1', 'example.com'),
    developmentDatabaseUrl.replace(':55442/', ':5432/'),
    developmentDatabaseUrl.replace('game_feedback:', 'postgres:'),
    developmentDatabaseUrl.replace('schema=public', 'schema=photo_contest'),
    `${developmentDatabaseUrl}&options=-csearch_path%3Dphoto_contest`,
    `${developmentDatabaseUrl}&schema=public`,
  ])
    assert.throws(() => guardDatabaseUrl(url));
});

test('test schemas require the isolated test database and an explicit opt in', () => {
  const target = testDatabaseUrl.replace('schema=public', 'schema=gf_test_flow_123');
  assert.throws(() => guardDatabaseUrl(target));
  assert.throws(() => guardDatabaseUrl(target, { test: true }));
  assert.equal(guardDatabaseUrl(target, { test: true, allowTestSchema: true }).schema, 'gf_test_flow_123');
  assert.throws(() =>
    guardDatabaseUrl(target.replace('gf_test_flow_123', 'public%3BDROP%20SCHEMA%20public'), {
      test: true,
      allowTestSchema: true,
    }),
  );
});
