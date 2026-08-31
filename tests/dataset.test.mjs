import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDataset,
  parseApprovedArticle,
  toCsv,
  toJsonl,
  validateDataset,
} from '../scripts/dataset.mjs';

const fixture = `---
title: Sample article
description: A short description.
summary: A source-backed summary.
publishedAt: "2026-08-28"
updatedAt: "2026-08-29"
topics: [HRIS, Payroll]
entities: [Example HR]
sources:
  - label: Example documentation
    url: https://example.com/docs
    lastChecked: "2026-08-29"
---
This body is not parsed as YAML.
`;

test('parses a valid approved article and normalizes its author', () => {
  const article = parseApprovedArticle(fixture, 'sample.md');

  assert.equal(article.slug, 'sample');
  assert.equal(article.author, 'Unified API Index');
  assert.equal(article.canonical_url, 'https://unified-api-comparison.info/research/sample/');
  assert.deepEqual(article.topics, ['HRIS', 'Payroll']);
  assert.equal(article.sources[0].last_checked, '2026-08-29');
});

test('rejects draft articles', () => {
  assert.throws(() => parseApprovedArticle(fixture.replace('title:', 'draft: true\ntitle:'), 'sample.md'), /draft/i);
});

test('rejects invalid ISO dates', () => {
  assert.throws(() => parseApprovedArticle(fixture.replace('2026-08-29', '2026-13-29'), 'sample.md'), /ISO date/i);
});

test('rejects non-HTTP source URLs', () => {
  assert.throws(() => parseApprovedArticle(fixture.replace('https://example.com/docs', 'ftp://example.com/docs'), 'sample.md'), /HTTP\(S\)/i);
});

test('rejects missing summaries', () => {
  assert.throws(() => parseApprovedArticle(fixture.replace('summary: A source-backed summary.\n', ''), 'sample.md'), /summary/i);
});

test('rejects a non-Unified API Index explicit author', () => {
  assert.throws(() => parseApprovedArticle(fixture.replace('title:', 'author: Someone Else\ntitle:'), 'sample.md'), /author/i);
});

test('rejects duplicate article URLs', () => {
  const first = parseApprovedArticle(fixture, 'first.md');
  const second = { ...parseApprovedArticle(fixture, 'second.md'), canonical_url: first.canonical_url };
  assert.throws(() => buildDataset([first, second]), /duplicate article URL/i);
});

test('rejects duplicate source IDs', () => {
  const dataset = buildDataset([parseApprovedArticle(fixture, 'sample.md')]);
  dataset.source_register.push({ ...dataset.source_register[0] });
  assert.throws(() => validateDataset(dataset), /duplicate source ID/i);
});

test('escapes CSV commas, quotes, and newlines', () => {
  assert.equal(
    toCsv([{ value: 'a,"b"\nc' }], ['value']),
    'value\n"a,""b""\nc"\n',
  );
});

test('builds the same dataset regardless of input order', () => {
  const first = parseApprovedArticle(fixture.replace('Sample article', 'First article'), 'first.md');
  const second = parseApprovedArticle(fixture.replace('Sample article', 'Second article'), 'second.md');
  const forward = buildDataset([first, second]);
  const reversed = buildDataset([second, first]);

  assert.deepEqual(forward, reversed);
  assert.equal(toJsonl(forward.catalog), toJsonl(reversed.catalog));
});
