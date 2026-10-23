import assert from 'node:assert/strict';
import { test } from 'node:test';
import { queueFilesFor } from '../queue-files.mjs';

const files = [
  '2026-10-23-queue.json',
  '2026-10-23-queue.log',
  '2026-10-23-queue.map.md',
  '2026-10-23-queue-b.json',
  '2026-10-23-queue-b.map.md',
  '2026-10-23-queue-b-followups-brief.md',
  '2026-10-23-queue-followups-brief.md',
  '2026-10-23-hardening.json',
  '2026-10-18-queue.json',
];

test('a plain queue name takes its own files, not the -b run', () => {
  assert.deepEqual(queueFilesFor('queue-2026-10-23', files), [
    '2026-10-23-queue.json',
    '2026-10-23-queue.log',
    '2026-10-23-queue.map.md',
    '2026-10-23-queue-followups-brief.md',
  ]);
});

test('a lettered queue name takes the briefs of that run only', () => {
  assert.deepEqual(queueFilesFor('queue-2026-10-23-b', files), [
    '2026-10-23-queue-b.json',
    '2026-10-23-queue-b.map.md',
    '2026-10-23-queue-b-followups-brief.md',
  ]);
});

test('a name that is not a queue run takes nothing', () => {
  assert.deepEqual(queueFilesFor('hardening', files), []);
  assert.deepEqual(queueFilesFor('queue-2026-10-23-extra', files), []);
});
