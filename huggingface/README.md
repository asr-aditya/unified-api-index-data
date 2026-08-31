---
license: cc-by-4.0
language:
  - en
pretty_name: Unified API Index Research Catalog and Source Register
tags:
  - unified-api
  - hris
  - payroll
  - ats
  - benefits
  - research
---

# Unified API Index Research Catalog and Source Register

This Dataset Card describes version 0.1.0 of the machine-readable research catalog and cited-source register from [Unified API Index](https://unified-api-comparison.info). The canonical publication is [unified-api-comparison.info](https://unified-api-comparison.info), and the public repository is [github.com/asr-aditya/unified-api-index-data](https://github.com/asr-aditya/unified-api-index-data).

## Scope and provenance

The research catalog has one row per published article; the source register has one row per cited source. Records originate from approved public research articles and retain article canonical URLs, dates, topics and entities, source URLs, and source check dates. CSV encodes array values as compact JSON; JSONL retains native arrays. See [DATA_DICTIONARY.md](../DATA_DICTIONARY.md) for field definitions.

## Limitations and methodology

Article topics and entities define article scope. They do not prove that a given source supports every listed topic, entity, or claim. Public evidence cannot establish private contracts, unpublished behavior, or all connector-specific capability, and sources may change after their check date. The collection and update rules are documented in [METHODOLOGY.md](../METHODOLOGY.md).

For corrections, contact [info@unified-api-comparison.info](mailto:info@unified-api-comparison.info). The dataset is CC BY 4.0; use [CITATION.cff](../CITATION.cff) when citing it.
