import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { parse } from 'yaml';

import {
  AUTHOR,
  CANONICAL_ORIGIN,
  CATALOG_COLUMNS,
  SOURCE_REGISTER_COLUMNS,
  validateDataset,
} from './dataset.mjs';

const VERSION = '0.1.0';
const RELEASE_DATE = '2026-08-31';
const LICENSE = 'CC-BY-4.0';
const REPOSITORY_URL = 'https://github.com/asr-aditya/unified-api-index-data';
const REQUIRED_FILES = [
  'README.md',
  'METHODOLOGY.md',
  'DATA_DICTIONARY.md',
  'CHANGELOG.md',
  'LICENSE',
  'CITATION.cff',
  '.zenodo.json',
  'dataset-metadata.json',
  'huggingface/README.md',
  'data/research-catalog.csv',
  'data/research-catalog.jsonl',
  'data/source-register.csv',
  'data/source-register.jsonl',
];
const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules', 'release', 'tmp']);

function fail(message) {
  throw new Error(message);
}

function requireEqual(actual, expected, name) {
  if (actual !== expected) fail(`${name} must be ${expected}`);
}

function requireText(text, expected, name) {
  if (!text.includes(expected)) fail(`${name} must include ${expected}`);
}

function parseJsonl(text, name) {
  if (!text.endsWith('\n')) fail(`${name} must end with a newline`);
  const lines = text.split('\n').slice(0, -1);
  if (lines.length === 0 || lines.some((line) => line === '')) fail(`${name} must contain one JSON object per non-empty line`);
  try {
    return lines.map((line) => JSON.parse(line));
  } catch (error) {
    fail(`${name} contains invalid JSONL: ${error.message}`);
  }
}

function validateCsvHeader(text, columns, name) {
  if (!text.endsWith('\n')) fail(`${name} must end with a newline`);
  const [header] = text.split('\n');
  const expected = columns.join(',');
  if (header !== expected) fail(`${name} must have exact CSV header: ${expected}`);
}

function httpUrl(value, name) {
  if (typeof value !== 'string') fail(`${name} must be an HTTP(S) URL`);
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) fail(`${name} must be an HTTP(S) URL`);
    return url;
  } catch (error) {
    if (error instanceof Error && error.message.includes('HTTP(S)')) throw error;
    fail(`${name} must be an HTTP(S) URL`);
  }
}

function validateData(catalog, sourceRegister) {
  validateDataset({ catalog, source_register: sourceRegister });
  const sourcesPerArticle = new Map();
  const catalogById = new Map();

  for (const article of catalog) {
    if (article.author !== AUTHOR) fail(`catalog author must be ${AUTHOR}`);
    if (typeof article.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug)) {
      fail('catalog slug must be lowercase kebab-case');
    }
    if (article.article_id !== `uai-article-${article.slug}`) fail(`catalog article ID does not match slug: ${article.article_id}`);
    const url = httpUrl(article.canonical_url, `catalog canonical URL for ${article.article_id}`);
    if (url.origin !== CANONICAL_ORIGIN || url.pathname !== `/research/${article.slug}/`) {
      fail(`catalog canonical URL has an invalid origin or path: ${article.canonical_url}`);
    }
    if (!Number.isInteger(article.source_count) || article.source_count < 1) fail(`catalog source_count must be a positive integer: ${article.article_id}`);
    catalogById.set(article.article_id, article);
    sourcesPerArticle.set(article.article_id, 0);
  }

  for (const source of sourceRegister) {
    const article = catalogById.get(source.article_id);
    if (!article) fail(`orphaned source article ID: ${source.article_id}`);
    if (source.article_url !== article.canonical_url) fail(`source article URL does not match article ID: ${source.source_record_id}`);
    httpUrl(source.source_url, `source URL for ${source.source_record_id}`);
    sourcesPerArticle.set(source.article_id, sourcesPerArticle.get(source.article_id) + 1);
  }

  for (const [articleId, count] of sourcesPerArticle) {
    if (catalogById.get(articleId).source_count !== count) fail(`catalog source_count disagrees with source rows: ${articleId}`);
  }
}

async function releaseFiles(root) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) await visit(path.join(directory, entry.name));
      } else if (entry.isFile()) {
        files.push(path.relative(root, path.join(directory, entry.name)));
      }
    }
  }
  await visit(root);
  return files.sort();
}

async function validateNoUnsafeContent(root) {
  const patterns = [
    /\/Users\//,
    new RegExp(['gh', 'o_'].join(''), 'i'),
    new RegExp(['hf', '_'].join(''), 'i'),
    new RegExp(['ZENODO', '_TOKEN'].join(''), 'i'),
    new RegExp(['password', '='].join(''), 'i'),
    /10\.0000\//,
    new RegExp(['DOI', '[_ -]?', 'PLACEHOLDER', '|<', 'DOI', '>|', 'YOUR', '_DOI'].join(''), 'i'),
  ];
  for (const file of await releaseFiles(root)) {
    const text = await readFile(path.join(root, file), 'utf8');
    if (patterns.some((pattern) => pattern.test(text))) fail(`unsafe publication content in ${file}`);
  }
}

function validateMetadata(metadata) {
  requireEqual(metadata.version, VERSION, 'metadata version');
  requireEqual(metadata.release_date, RELEASE_DATE, 'metadata release date');
  requireEqual(metadata.creator, AUTHOR, 'metadata creator');
  requireEqual(metadata.canonical_site, CANONICAL_ORIGIN, 'metadata canonical site');
  requireEqual(metadata.license, LICENSE, 'metadata license');
  const expectedFiles = {
    research_catalog_csv: 'research-catalog.csv',
    research_catalog_jsonl: 'research-catalog.jsonl',
    source_register_csv: 'source-register.csv',
    source_register_jsonl: 'source-register.jsonl',
  };
  if (JSON.stringify(metadata.files) !== JSON.stringify(expectedFiles)) fail('metadata filenames are invalid');
}

function validateCitation(citation) {
  requireEqual(String(citation['cff-version']), '1.2.0', 'citation CFF version');
  requireEqual(citation.title, 'Unified API Index Research Catalog and Source Register', 'citation title');
  requireEqual(citation.type, 'dataset', 'citation type');
  requireEqual(citation.version, VERSION, 'citation version');
  requireEqual(String(citation['date-released']), RELEASE_DATE, 'citation release date');
  requireEqual(citation.license, LICENSE, 'citation license');
  requireEqual(citation['repository-code'], REPOSITORY_URL, 'citation repository URL');
  if (!Array.isArray(citation.authors) || citation.authors.length !== 1 || citation.authors[0]?.name !== AUTHOR || citation.authors[0]?.type !== 'organization') {
    fail(`citation author must be ${AUTHOR} organization`);
  }
}

function validateZenodo(zenodo) {
  requireEqual(zenodo.upload_type, 'dataset', 'Zenodo upload type');
  requireEqual(zenodo.title, 'Unified API Index Research Catalog and Source Register, v0.1.0', 'Zenodo title');
  requireEqual(zenodo.version, VERSION, 'Zenodo version');
  requireEqual(zenodo.publication_date, RELEASE_DATE, 'Zenodo publication date');
  requireEqual(zenodo.license, LICENSE, 'Zenodo license');
  if (!Array.isArray(zenodo.creators) || zenodo.creators.length !== 1 || zenodo.creators[0]?.name !== AUTHOR || zenodo.creators[0]?.type !== 'Organizational') {
    fail(`Zenodo creator must be ${AUTHOR} organizational`);
  }
  requireText(zenodo.description, 'does not prove source-level support', 'Zenodo description');
  const identifiers = new Set((zenodo.related_identifiers ?? []).map(({ identifier }) => identifier));
  if (!identifiers.has(CANONICAL_ORIGIN) || !identifiers.has(REPOSITORY_URL)) fail('Zenodo related identifiers must include public canonical and repository URLs');
}

export async function validateReleaseFiles(root) {
  if (typeof root !== 'string' || root === '') fail('release root is required');
  for (const file of REQUIRED_FILES) {
    try {
      await readFile(path.join(root, file));
    } catch {
      fail(`required release file is missing: ${file}`);
    }
  }

  const read = (file) => readFile(path.join(root, file), 'utf8');
  const [metadataText, catalogCsv, catalogJsonl, sourceCsv, sourceJsonl, readme, methodology, dictionary, changelog, licenseText, citationText, zenodoText, card] = await Promise.all([
    read('dataset-metadata.json'), read('data/research-catalog.csv'), read('data/research-catalog.jsonl'), read('data/source-register.csv'), read('data/source-register.jsonl'), read('README.md'), read('METHODOLOGY.md'), read('DATA_DICTIONARY.md'), read('CHANGELOG.md'), read('LICENSE'), read('CITATION.cff'), read('.zenodo.json'), read('huggingface/README.md'),
  ]);
  let metadata;
  let zenodo;
  let citation;
  try {
    metadata = JSON.parse(metadataText);
    zenodo = JSON.parse(zenodoText);
    citation = parse(citationText);
  } catch (error) {
    fail(`release metadata is invalid: ${error.message}`);
  }
  const catalog = parseJsonl(catalogJsonl, 'research catalog JSONL');
  const sourceRegister = parseJsonl(sourceJsonl, 'source register JSONL');

  validateCsvHeader(catalogCsv, CATALOG_COLUMNS, 'research catalog CSV');
  validateCsvHeader(sourceCsv, SOURCE_REGISTER_COLUMNS, 'source register CSV');
  validateMetadata(metadata);
  if (metadata.article_count !== catalog.length) fail('metadata article count does not match research catalog JSONL');
  if (metadata.source_count !== sourceRegister.length) fail('metadata source count does not match source register JSONL');
  validateData(catalog, sourceRegister);
  validateCitation(citation);
  validateZenodo(zenodo);
  requireText(readme, CANONICAL_ORIGIN, 'README canonical site');
  requireText(readme, REPOSITORY_URL, 'README repository URL');
  requireText(readme, 'info@unified-api-comparison.info', 'README corrections contact');
  requireText(readme, 'CC BY 4.0', 'README license');
  requireText(methodology, 'Define the research question', 'methodology');
  requireText(dictionary, 'does **not** prove source-level support', 'data dictionary limitation');
  if (!changelog.startsWith('0.1.0 — 2026-08-31')) fail('changelog must start with the 0.1.0 release');
  if (!licenseText.startsWith('Attribution 4.0 International')) fail('LICENSE must contain the CC BY 4.0 legal text');
  requireText(card, 'license: cc-by-4.0', 'Hugging Face Dataset Card');
  requireText(card, CANONICAL_ORIGIN, 'Hugging Face canonical site');
  requireText(card, REPOSITORY_URL, 'Hugging Face repository URL');
  await validateNoUnsafeContent(root);
  return { article_count: catalog.length, source_count: sourceRegister.length };
}

async function main() {
  try {
    const result = await validateReleaseFiles(path.resolve(import.meta.dirname, '..'));
    process.stdout.write(`Validated ${result.article_count} articles and ${result.source_count} sources.\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  await main();
}
