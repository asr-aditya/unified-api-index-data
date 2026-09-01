import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';

import {
  buildDataset,
  CATALOG_COLUMNS,
  parseApprovedArticle,
  SOURCE_REGISTER_COLUMNS,
  toCsv,
  toJsonl,
  validateDataset,
} from '../scripts/dataset.mjs';
import { validateReleaseFiles } from '../scripts/validate.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const node = process.execPath;

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

test('rejects a source article URL that does not match its article', () => {
  const dataset = buildDataset([parseApprovedArticle(fixture, 'sample.md')]);
  dataset.source_register[0].article_url = 'https://example.com/research/sample/';
  assert.throws(() => validateDataset(dataset), /source article URL/i);
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

async function temporaryRelease() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'uai-release-'));
  for (const file of [
    'README.md', 'METHODOLOGY.md', 'DATA_DICTIONARY.md', 'CHANGELOG.md', 'LICENSE',
    'CITATION.cff', '.zenodo.json', 'dataset-metadata.json', 'package.json',
    'package-lock.json', '.gitignore',
  ]) {
    await writeFile(path.join(root, file), await readFile(path.join(repositoryRoot, file)));
  }
  await mkdir(path.join(root, 'data'), { recursive: true });
  await mkdir(path.join(root, 'huggingface'), { recursive: true });
  for (const file of [
    'research-catalog.csv', 'research-catalog.jsonl', 'source-register.csv', 'source-register.jsonl',
  ]) {
    await writeFile(path.join(root, 'data', file), await readFile(path.join(repositoryRoot, 'data', file)));
  }
  await writeFile(path.join(root, 'huggingface', 'README.md'), await readFile(path.join(repositoryRoot, 'huggingface', 'README.md')));
  return root;
}

async function withTemporaryRelease(change, assertion) {
  const root = await temporaryRelease();
  try {
    await change(root);
    await assertion(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function jsonlRows(root, filename) {
  return (await readFile(path.join(root, 'data', filename), 'utf8')).trim().split('\n').map(JSON.parse);
}

function datasetCardMetadata(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, 'Dataset Card must start with YAML front matter');
  return parse(match[1]);
}

test('validates the checked-in release', async () => {
  await assert.doesNotReject(() => validateReleaseFiles(repositoryRoot));
});

test('Dataset Card declares the exact two JSONL-only viewer configurations', async () => {
  const card = await readFile(path.join(repositoryRoot, 'huggingface', 'README.md'), 'utf8');
  assert.deepEqual(datasetCardMetadata(card).configs, [
    {
      config_name: 'research-catalog',
      data_files: [{ split: 'train', path: 'data/research-catalog.jsonl' }],
      default: true,
    },
    {
      config_name: 'source-register',
      data_files: [{ split: 'train', path: 'data/source-register.jsonl' }],
    },
  ]);
});

test('rejects a Dataset Card that mixes source-register rows into the default viewer config', async () => {
  await withTemporaryRelease(
    async (root) => {
      const file = path.join(root, 'huggingface', 'README.md');
      const card = await readFile(file, 'utf8');
      await writeFile(file, card.replace(
        'path: data/research-catalog.jsonl',
        'path: data/source-register.jsonl',
      ));
    },
    async (root) => assert.rejects(() => validateReleaseFiles(root), /Dataset Card configs/i),
  );
});

test('rejects a Dataset Card with more than one default viewer config', async () => {
  await withTemporaryRelease(
    async (root) => {
      const file = path.join(root, 'huggingface', 'README.md');
      const card = await readFile(file, 'utf8');
      await writeFile(file, card.replace(
        '  - config_name: source-register',
        '  - config_name: source-register\n    default: true',
      ));
    },
    async (root) => assert.rejects(() => validateReleaseFiles(root), /Dataset Card configs/i),
  );
});

test('rejects a release missing its license', async () => {
  await withTemporaryRelease(
    (root) => rm(path.join(root, 'LICENSE')),
    async (root) => assert.rejects(() => validateReleaseFiles(root), /LICENSE/i),
  );
});

test('rejects a README without the canonical URL', async () => {
  await withTemporaryRelease(
    async (root) => writeFile(path.join(root, 'README.md'), '# Missing canonical URL\n'),
    async (root) => assert.rejects(() => validateReleaseFiles(root), /canonical site|README/i),
  );
});

test('rejects a citation with a different organizational author', async () => {
  await withTemporaryRelease(
    async (root) => {
      const file = path.join(root, 'CITATION.cff');
      await writeFile(file, (await readFile(file, 'utf8')).replace('  - name: Unified API Index', '  - name: Someone Else'));
    },
    async (root) => assert.rejects(() => validateReleaseFiles(root), /citation.*author/i),
  );
});

test('rejects an invalid metadata DOI', async () => {
  await withTemporaryRelease(
    async (root) => {
      const file = path.join(root, 'dataset-metadata.json');
      const metadata = JSON.parse(await readFile(file, 'utf8'));
      metadata.doi = 'not-a-doi';
      await writeFile(file, `${JSON.stringify(metadata, null, 2)}\n`);
    },
    async (root) => assert.rejects(() => validateReleaseFiles(root), /metadata DOI.*valid DOI/i),
  );
});

test('rejects DOI values that disagree across release metadata', async () => {
  await withTemporaryRelease(
    async (root) => {
      const file = path.join(root, 'CITATION.cff');
      await writeFile(file, (await readFile(file, 'utf8')).replace(
        'doi: 10.5281/zenodo.22226503',
        'doi: 10.5281/zenodo.99999999',
      ));
    },
    async (root) => assert.rejects(() => validateReleaseFiles(root), /citation DOI/i),
  );
});

test('accepts a CFF entity author and legacy Zenodo creator without type fields', async () => {
  await withTemporaryRelease(
    async (root) => {
      const citation = path.join(root, 'CITATION.cff');
      const zenodo = path.join(root, '.zenodo.json');
      await writeFile(citation, (await readFile(citation, 'utf8')).replace('    type: organization\n', ''));
      const metadata = JSON.parse(await readFile(zenodo, 'utf8'));
      delete metadata.creators[0].type;
      await writeFile(zenodo, `${JSON.stringify(metadata, null, 2)}\n`);
    },
    async (root) => assert.doesNotReject(() => validateReleaseFiles(root)),
  );
});

test('rejects metadata counts that disagree with JSONL', async () => {
  await withTemporaryRelease(
    async (root) => {
      const metadata = JSON.parse(await readFile(path.join(root, 'dataset-metadata.json'), 'utf8'));
      metadata.article_count += 1;
      await writeFile(path.join(root, 'dataset-metadata.json'), `${JSON.stringify(metadata)}\n`);
    },
    async (root) => assert.rejects(() => validateReleaseFiles(root), /article count/i),
  );
});

test('rejects orphaned source article IDs', async () => {
  await withTemporaryRelease(
    async (root) => {
      const file = path.join(root, 'data', 'source-register.jsonl');
      const rows = (await readFile(file, 'utf8')).trim().split('\n').map(JSON.parse);
      rows[0].article_id = 'uai-article-missing';
      await writeFile(file, `${rows.map(JSON.stringify).join('\n')}\n`);
      await writeFile(path.join(root, 'data', 'source-register.csv'), toCsv(rows, SOURCE_REGISTER_COLUMNS));
    },
    async (root) => assert.rejects(() => validateReleaseFiles(root), /orphaned source article ID/i),
  );
});

test('rejects a truncated catalog CSV', async () => {
  await withTemporaryRelease(
    async (root) => {
      const rows = await jsonlRows(root, 'research-catalog.jsonl');
      await writeFile(path.join(root, 'data', 'research-catalog.csv'), toCsv(rows.slice(0, -1), CATALOG_COLUMNS));
    },
    async (root) => assert.rejects(() => validateReleaseFiles(root), /research catalog CSV.*row count/i),
  );
});

test('rejects a stale catalog CSV row', async () => {
  await withTemporaryRelease(
    async (root) => {
      const rows = await jsonlRows(root, 'research-catalog.jsonl');
      rows[0].summary = 'Stale catalog summary.';
      await writeFile(path.join(root, 'data', 'research-catalog.csv'), toCsv(rows, CATALOG_COLUMNS));
    },
    async (root) => assert.rejects(() => validateReleaseFiles(root), /research catalog CSV.*disagrees/i),
  );
});

test('rejects a catalog CSV with a non-integer source count', async () => {
  await withTemporaryRelease(
    async (root) => {
      const rows = await jsonlRows(root, 'research-catalog.jsonl');
      rows[0].source_count = 'not-a-number';
      await writeFile(path.join(root, 'data', 'research-catalog.csv'), toCsv(rows, CATALOG_COLUMNS));
    },
    async (root) => assert.rejects(() => validateReleaseFiles(root), /source_count.*integer/i),
  );
});

test('rejects a source CSV with disagreeing article-topic arrays', async () => {
  await withTemporaryRelease(
    async (root) => {
      const rows = await jsonlRows(root, 'source-register.jsonl');
      rows[0].article_topics = ['Stale topic'];
      await writeFile(path.join(root, 'data', 'source-register.csv'), toCsv(rows, SOURCE_REGISTER_COLUMNS));
    },
    async (root) => assert.rejects(() => validateReleaseFiles(root), /source register CSV.*disagrees/i),
  );
});

for (const pattern of ['/' + 'Users/', 'gh' + 'o_', 'hf' + '_', 'ZENODO' + '_TOKEN', 'password' + '=']) {
  test(`rejects prohibited publication content: ${pattern}`, async () => {
    await withTemporaryRelease(
      async (root) => {
        const file = path.join(root, 'README.md');
        await writeFile(file, `${await readFile(file, 'utf8')}${pattern}\n`);
      },
      async (root) => assert.rejects(() => validateReleaseFiles(root), /unsafe publication content/i),
    );
  });
}

test('export CLI reads only top-level markdown and writes complete deterministic output', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'uai-export-'));
  try {
    const source = path.join(root, 'approved');
    const output = path.join(root, 'data');
    const metadata = path.join(root, 'dataset-metadata.json');
    await mkdir(path.join(source, 'nested'), { recursive: true });
    await writeFile(path.join(source, 'sample.md'), fixture);
    await writeFile(path.join(source, 'nested', 'ignored.md'), fixture.replace('Sample article', 'Ignored article'));
    const result = spawnSync(node, [path.join(repositoryRoot, 'scripts', 'export.mjs'), '--source', source, '--output', output, '--metadata', metadata], { encoding: 'utf8' });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Exported 1 articles and 1 sources/);
    const releaseMetadata = JSON.parse(await readFile(metadata, 'utf8'));
    assert.equal(releaseMetadata.article_count, 1);
    assert.equal(releaseMetadata.source_count, 1);
    assert.deepEqual(releaseMetadata.files, {
      research_catalog_csv: 'research-catalog.csv',
      research_catalog_jsonl: 'research-catalog.jsonl',
      source_register_csv: 'source-register.csv',
      source_register_jsonl: 'source-register.jsonl',
    });
    assert.doesNotMatch(await readFile(metadata, 'utf8'), new RegExp(source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    for (const file of Object.values(releaseMetadata.files)) {
      assert.match(await readFile(path.join(output, file), 'utf8'), /\n$/);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('importing the exporter has no CLI side effects and invalid CLI arguments fail', () => {
  const imported = spawnSync(node, ['--input-type=module', '--eval', `await import(${JSON.stringify(path.join(repositoryRoot, 'scripts', 'export.mjs'))});`], { encoding: 'utf8' });
  assert.equal(imported.status, 0, imported.stderr);
  assert.equal(imported.stdout, '');
  assert.equal(imported.stderr, '');

  const invalid = spawnSync(node, [path.join(repositoryRoot, 'scripts', 'export.mjs'), '--source'], { encoding: 'utf8' });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Usage:/);
});
