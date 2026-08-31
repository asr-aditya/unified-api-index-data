# Unified API Index Research Catalog and Source Register

Version 0.1.0 is a machine-readable release of the research catalog and cited-source register published by [Unified API Index](https://unified-api-comparison.info). The canonical publication is [unified-api-comparison.info](https://unified-api-comparison.info); the public working repository is [github.com/asr-aditya/unified-api-index-data](https://github.com/asr-aditya/unified-api-index-data).

## Scope and provenance

`research-catalog` has one row per published research article. `source-register` has one row per source cited by an article, so its rows are evidence references rather than independent product claims. Records are derived from the public research publication's approved articles and retain each article's canonical URL, publication and update dates, article-level topics and entities, source URL, and source check date.

The catalog follows the [methodology](METHODOLOGY.md): public evidence is collected, claims are kept within the support of their citations, and limitations or uncertainty are recorded rather than inferred. Read the publication's live pages for the editorial context and latest corrections.

## Files

- `data/research-catalog.csv` and `data/research-catalog.jsonl`: one record per article.
- `data/source-register.csv` and `data/source-register.jsonl`: one record per cited source.
- `dataset-metadata.json`: release identity, counts, filenames, canonical site, and license.
- `DATA_DICTIONARY.md`: fields and interpretation constraints.
- `METHODOLOGY.md`: research process and evidence policy.

## Use

Use CSV in spreadsheet or SQL workflows and JSONL in streaming or document-oriented tools. Join source-register rows to research-catalog rows on `article_id`. Validate a checkout with `npm test && npm run validate` using Node.js 22 or newer.

## Limitations and corrections

Article `topics` and `entities` describe the article's scope. They do **not** establish that every listed source supports every topic, entity, or claim. Public research cannot verify private contracts, unpublished behavior, or all connector-specific behavior; source and product information can change after its recorded check date.

For corrections, email [info@unified-api-comparison.info](mailto:info@unified-api-comparison.info). See [CHANGELOG.md](CHANGELOG.md) for release history.

## Citation and license

Please cite this dataset using [CITATION.cff](CITATION.cff). It is licensed under [Creative Commons Attribution 4.0 International](LICENSE) (CC BY 4.0).
