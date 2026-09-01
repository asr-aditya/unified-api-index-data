import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  AUTHOR,
  CANONICAL_ORIGIN,
  CATALOG_COLUMNS,
  SOURCE_REGISTER_COLUMNS,
  buildDataset,
  parseApprovedArticle,
  toCsv,
  toJsonl,
  validateDataset,
} from './dataset.mjs';

const RELEASE_DATE = '2026-08-31';
const VERSION = '0.1.0';

function usage() {
  return 'Usage: node scripts/export.mjs --source <approved-directory> --output <data-directory> --metadata <metadata-file>';
}

function parseArgs(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!['--source', '--output', '--metadata'].includes(key) || !value || value.startsWith('--')) {
      throw new Error(usage());
    }
    values[key.slice(2)] = value;
  }
  if (args.length !== 6 || !values.source || !values.output || !values.metadata) throw new Error(usage());
  return values;
}

async function exportDataset({ source, output, metadata }) {
  const markdownFiles = (await readdir(source, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && path.extname(entry.name) === '.md')
    .map((entry) => entry.name)
    .sort();
  const records = await Promise.all(markdownFiles.map(async (filename) => (
    parseApprovedArticle(await readFile(path.join(source, filename), 'utf8'), filename)
  )));
  const dataset = buildDataset(records);
  validateDataset(dataset);

  await mkdir(output, { recursive: true });
  const files = {
    research_catalog_csv: 'research-catalog.csv',
    research_catalog_jsonl: 'research-catalog.jsonl',
    source_register_csv: 'source-register.csv',
    source_register_jsonl: 'source-register.jsonl',
  };
  await Promise.all([
    writeFile(path.join(output, files.research_catalog_csv), toCsv(dataset.catalog, CATALOG_COLUMNS)),
    writeFile(path.join(output, files.research_catalog_jsonl), toJsonl(dataset.catalog)),
    writeFile(path.join(output, files.source_register_csv), toCsv(dataset.source_register, SOURCE_REGISTER_COLUMNS)),
    writeFile(path.join(output, files.source_register_jsonl), toJsonl(dataset.source_register)),
  ]);
  const releaseMetadata = {
    version: VERSION,
    release_date: RELEASE_DATE,
    creator: AUTHOR,
    canonical_site: CANONICAL_ORIGIN,
    license: 'CC-BY-4.0',
    article_count: dataset.catalog.length,
    source_count: dataset.source_register.length,
    files,
  };
  await mkdir(path.dirname(metadata), { recursive: true });
  await writeFile(metadata, `${JSON.stringify(releaseMetadata, null, 2)}\n`);
  return releaseMetadata;
}

async function main() {
  try {
    const metadata = await exportDataset(parseArgs(process.argv.slice(2)));
    process.stdout.write(`Exported ${metadata.article_count} articles and ${metadata.source_count} sources.\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}

export { exportDataset, main, parseArgs };
