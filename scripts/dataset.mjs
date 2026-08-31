import path from 'node:path';
import { parse } from 'yaml';

export const CANONICAL_ORIGIN = 'https://unified-api-comparison.info';
export const AUTHOR = 'Unified API Index';
export const CATALOG_COLUMNS = [
  'article_id', 'slug', 'title', 'description', 'summary', 'author', 'published_at',
  'updated_at', 'canonical_url', 'topics', 'entities', 'source_count',
];
export const SOURCE_REGISTER_COLUMNS = [
  'source_record_id', 'article_id', 'article_url', 'source_label', 'source_url',
  'last_checked', 'article_topics', 'article_entities',
];

function fail(message) {
  throw new Error(message);
}

function requiredString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') fail(`${name} is required`);
  return value.trim();
}

function isoDate(value, name) {
  const date = requiredString(String(value ?? ''), name);
  const parsed = new Date(`${date}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || Number.isNaN(parsed.valueOf())
    || parsed.toISOString().slice(0, 10) !== date
  ) {
    fail(`${name} must be a valid ISO date (YYYY-MM-DD)`);
  }
  return date;
}

function httpUrl(value, name) {
  const url = requiredString(value, name);
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    fail(`${name} must be an HTTP(S) URL`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) fail(`${name} must be an HTTP(S) URL`);
  return url;
}

function stringArray(value, name) {
  if (!Array.isArray(value) || value.length === 0) fail(`${name} must be a non-empty array`);
  return value.map((entry) => requiredString(entry, `${name} entry`));
}

function frontmatter(markdown) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown);
  if (!match) fail('Markdown must begin with a YAML frontmatter block');
  const document = parse(match[1]);
  if (!document || typeof document !== 'object' || Array.isArray(document)) fail('YAML frontmatter must be an object');
  return document;
}

export function parseApprovedArticle(markdown, filename) {
  if (typeof markdown !== 'string') fail('Markdown must be a string');
  const data = frontmatter(markdown);
  if (data.draft === true) fail('Draft articles cannot be exported');

  const slug = path.basename(filename, path.extname(filename));
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) fail('Filename must provide a lowercase kebab-case slug');
  if (data.author !== undefined && data.author !== AUTHOR) fail(`author must be ${AUTHOR}`);
  if (!Array.isArray(data.sources) || data.sources.length === 0) fail('sources must be a non-empty array');

  return {
    slug,
    title: requiredString(data.title, 'title'),
    description: requiredString(data.description, 'description'),
    summary: requiredString(data.summary, 'summary'),
    author: AUTHOR,
    published_at: isoDate(data.publishedAt, 'publishedAt'),
    updated_at: isoDate(data.updatedAt, 'updatedAt'),
    canonical_url: `${CANONICAL_ORIGIN}/research/${slug}/`,
    topics: stringArray(data.topics, 'topics'),
    entities: stringArray(data.entities, 'entities'),
    sources: data.sources.map((source, index) => {
      if (!source || typeof source !== 'object' || Array.isArray(source)) fail(`source ${index + 1} must be an object`);
      return {
        source_label: requiredString(source.label, `source ${index + 1} label`),
        source_url: httpUrl(source.url, `source ${index + 1} URL`),
        last_checked: isoDate(source.lastChecked, `source ${index + 1} lastChecked`),
      };
    }),
  };
}

export function buildDataset(records) {
  if (!Array.isArray(records)) fail('records must be an array');
  const catalog = [];
  const source_register = [];
  for (const article of [...records].sort((left, right) => left.slug.localeCompare(right.slug))) {
    const article_id = `uai-article-${article.slug}`;
    catalog.push({
      article_id,
      slug: article.slug,
      title: article.title,
      description: article.description,
      summary: article.summary,
      author: article.author,
      published_at: article.published_at,
      updated_at: article.updated_at,
      canonical_url: article.canonical_url,
      topics: [...article.topics],
      entities: [...article.entities],
      source_count: article.sources.length,
    });
    article.sources.forEach((source, index) => {
      source_register.push({
        source_record_id: `uai-source-${article.slug}-${String(index + 1).padStart(3, '0')}`,
        article_id,
        article_url: article.canonical_url,
        source_label: source.source_label,
        source_url: source.source_url,
        last_checked: source.last_checked,
        article_topics: [...article.topics],
        article_entities: [...article.entities],
      });
    });
  }
  const dataset = { catalog, source_register };
  validateDataset(dataset);
  return dataset;
}

export function validateDataset(dataset) {
  if (!dataset || !Array.isArray(dataset.catalog) || !Array.isArray(dataset.source_register)) {
    fail('dataset must include catalog and source_register arrays');
  }
  const articleIds = new Set();
  const articleUrls = new Set();
  const articleUrlById = new Map();
  for (const article of dataset.catalog) {
    if (articleIds.has(article.article_id)) fail(`duplicate article ID: ${article.article_id}`);
    if (articleUrls.has(article.canonical_url)) fail(`duplicate article URL: ${article.canonical_url}`);
    articleIds.add(article.article_id);
    articleUrls.add(article.canonical_url);
    articleUrlById.set(article.article_id, article.canonical_url);
  }
  const sourceIds = new Set();
  for (const source of dataset.source_register) {
    if (sourceIds.has(source.source_record_id)) fail(`duplicate source ID: ${source.source_record_id}`);
    sourceIds.add(source.source_record_id);
    if (!articleIds.has(source.article_id)) fail(`orphaned source article ID: ${source.article_id}`);
    if (source.article_url !== articleUrlById.get(source.article_id)) {
      fail(`source article URL does not match article ID: ${source.source_record_id}`);
    }
  }
  return dataset;
}

function csvValue(value) {
  const text = Array.isArray(value) ? JSON.stringify(value) : String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows, columns) {
  if (!Array.isArray(rows) || !Array.isArray(columns)) fail('rows and columns must be arrays');
  return `${[columns, ...rows.map((row) => columns.map((column) => csvValue(row[column])))]
    .map((row) => row.join(','))
    .join('\n')}\n`;
}

export function toJsonl(rows) {
  if (!Array.isArray(rows)) fail('rows must be an array');
  return `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`;
}
