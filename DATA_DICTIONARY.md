# Data Dictionary

The release provides CSV and JSONL forms of the same two datasets. Array values are compact JSON arrays in CSV and native arrays in JSONL.

## Research catalog

| Field | Meaning |
| --- | --- |
| `article_id` | Stable release identifier: `uai-article-<slug>`. |
| `slug` | Lowercase, kebab-case article path segment. |
| `title` | Published article title. |
| `description` | Published short article description. |
| `summary` | Source-backed editorial summary. |
| `author` | Publication author, `Unified API Index`. |
| `published_at` | Article publication date (ISO `YYYY-MM-DD`). |
| `updated_at` | Date of the article's latest substantive review (ISO `YYYY-MM-DD`). |
| `canonical_url` | Canonical public article URL. |
| `topics` | Article-level research topics. |
| `entities` | Article-level products, vendors, or concepts in scope. |
| `source_count` | Number of cited-source rows for the article. |

## Source register

| Field | Meaning |
| --- | --- |
| `source_record_id` | Stable source-row identifier: `uai-source-<slug>-<ordinal>`. |
| `article_id` | Identifier joining this source to the research catalog. |
| `article_url` | Canonical URL of the associated article. |
| `source_label` | Human-readable citation label. |
| `source_url` | HTTP(S) URL consulted for the article. |
| `last_checked` | Date the source was checked (ISO `YYYY-MM-DD`). |
| `article_topics` | Copied article-level topics for filtering and context. |
| `article_entities` | Copied article-level entities for filtering and context. |

`article_topics` and `article_entities` are article metadata only. Their presence on a source-register row does **not** prove source-level support for each topic, entity, or claim. Use the article and source URL together to evaluate a specific statement.
