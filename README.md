# Dataset Observatory

A metadata-only crawler and searchable web catalog for image classification datasets.

## Use

Use **Discover new datasets** to continue the shared, persistent queue of unexplored pages. Hugging Face directory responses supply next-page cursors; each cursor is saved before the current page is marked explored. Subsequent runs continue beyond earlier results instead of restarting the first page. Enter up to 20 starting URLs to add sources. A discovery run inspects 5–40 pages, follows relevant HTML links up to three levels deep, and saves all remaining work when its budget ends. Duplicate/previously explored URLs are skipped. Failed pages stay visible, retry after one hour, and stop automatic retries after three attempts.

Use **Refresh existing records** to revisit known dataset pages, oldest crawl dates first. Refresh updates metadata and crawl dates without expanding or consuming the discovery queue. Both actions share one active crawl so multiple tabs cannot create overlapping jobs. Keep the tab open while crawling; interrupted jobs can be resumed after reopening the site. Queue state is stored in D1, not browser storage.

The default discovery sources include public publisher pages and Hugging Face's image-classification directory. Compact API requests ask for card metadata, descriptions, and tags, excluding potentially enormous repository file listings. This is bounded web discovery, not an exhaustive search engine. JavaScript-only sites, login-protected pages, inaccessible robots files, and metadata pages larger than 700 KB are logged and skipped. Robots rules are checked before each page and redirect. A one-second pause separates page inspections.

The first upgraded discovery imports unexplored pages from legacy runs and skips their already inspected pages. It makes one initial directory request to obtain the previously unsaved pagination cursor. Existing datasets and their discovery dates are retained.

The catalog stores a generated name, image subject, category count, expected image count, dataset page URL, first discovery timestamp, latest crawl attempt, latest successful inspection, source evidence, and fetch errors. Dates display in the viewer's timezone; exports preserve ISO timestamps. Upserts preserve discovery dates. Failed rechecks preserve existing metadata and record the failed attempt separately.

**Metadata matches** have supported structured counts or a publisher-specific parser. **Needs review** contains heuristic candidates, including missing counts. These are clearly marked; unknown counts are never replaced with invented values. Counts can represent a publisher's splits or largest documented configuration. They are estimates from metadata, not independently counted images. Different catalog entries may overlap.

Click a dataset name for evidence. Use the source link to visit its dataset page. CSV and JSON buttons export the current search/filter results; `/api/export` and `/api/export?format=json` export the full persisted catalog.

## Search the catalog

Combine the **Domain** selector (including Biodiversity), an inclusive publication/hosting date range, and minimum/maximum image counts with text search, source filters, and match/review tabs. Domains are inferred from dataset names, descriptions and tags; a record can have multiple domains. Existing records receive inferred labels immediately without a new crawl. Keyword-based labels are explained in record details and are not publisher-verified taxonomy.

Publication dates are separate from `foundAt` (first discovery) and `crawledAt` (latest crawl attempt). For HTML pages the crawler accepts explicit primary Dataset/Page JSON-LD `datePublished` or published/issued meta tags. It never treats paper citations, copyright years, modification dates, or crawl timestamps as publication dates. For Hugging Face it requests `createdAt` and labels this **Repository created**, with its source URL and evidence. Repository creation is a hosting-date proxy; it does not prove the original dataset release date or when an originally private repository became public. The **Date evidence** selector can exclude repository creation proxies. Missing/invalid dates stay unknown. Use **Collect missing source dates** for efficient Hugging Face date enrichment in batches of 25 metadata records. It updates existing entries only, preserves counts and discovery/crawl dates, stops when dates are collected, and retains its next-page cursor across budget-limited runs. It does not consume the discovery queue. Use **Refresh existing records** to collect publisher-page dates or refresh all other metadata; a later page lacking that field does not erase a previously collected date.

Active date ranges exclude records without dates; active image-count ranges exclude unknown image counts. Invalid ranges show validation feedback and return no results. Publication date sorting places unknowns last. CSV/JSON buttons export the currently filtered list and include domain labels, date provenance, and the separate crawl dates. `/api/export` supports the same query parameters: `domain`, `publishedFrom`, `publishedTo`, `dateAvailability` (`any`, `known`, `unknown`, `published`, `repository`), `minImages`, `maxImages`, `query`, `source`, `status`, and `sort`. Add `format=json` for JSON.

## Implementation

- React / Vinext UI, Cloudflare Worker routes, D1 / Drizzle persistent records and crawl jobs.
- `lib/crawler.mjs`: restricted page fetcher, robots checks, structured Hugging Face metadata, publisher and generic HTML extraction, bounded link discovery, CSV escaping.
- `lib/crawl-service.mjs`: persistent frontier, pagination, shared atomic processing lease, separate discovery/refresh modes, legacy queue import, retry backoff, and timestamp preservation. `lib/catalog.ts` supplies the Worker database binding.
- `db/schema.ts`, `drizzle/`: database schema and migrations.
- `app/api/`: catalog, crawl start/step, exports.
- `tests/crawler.test.mjs` and `tests/discovery.test.mjs`: parser/robots/export tests plus integration tests using real SQLite and committed migrations for multi-run discovery, queue persistence, refresh separation, concurrent requests, retries, and legacy import.

No dataset archives, images, labels files, or dataset contents are requested. Only HTML/text/JSON metadata responses are accepted, capped while streaming. File extensions, download endpoints, credentials, IP literals, local hostnames and nonstandard ports are rejected. Production runs on Cloudflare's outbound networking restrictions. Do not expose a local development server to untrusted clients.

## Development

Requires Node 22.13+ and a current npm. Install with the Sites `install-dependencies.mjs` helper (or `npm run install:ci` outside Sites). The hosting manifest declares the `DB` D1 binding.

```sh
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_smooth_groot.sql
npm run dev
```

```sh
node --test tests/crawler.test.mjs tests/discovery.test.mjs tests/catalog-search.test.mjs
node node_modules/typescript/bin/tsc --noEmit
```

Apply the local schema once to a fresh preview database, then apply subsequent migration files in order (including `0001_lush_sersi.sql` for discovery state and `0002_mighty_oracle.sql` for domain/publication metadata). Sites applies committed migrations to the separate hosted database during deployment. Future schema changes use `npm run db:generate` and new migrations.

Crawls run on demand. There is no automatic schedule enabled. Production records are separate from local preview records. No API keys are required for the public sources.

## Dataset deduplication

The catalog automatically groups recognized benchmark aliases and informative normalized names with compatible documented counts. It applies to existing records immediately and future crawls. Matching uses titles, not descriptions that may mention a parent dataset; variants and conflicting counts remain separate. Automatic matching is conservative and cannot identify every mirror or renamed copy.

Select 2–50 catalog records and use **Group selected datasets** for duplicates that need human judgment. Open a dataset to see every original source link, per-source counts, publication evidence and crawl dates. **Keep this listing separate** creates a persistent exclusion from automatic matching; the record can be manually grouped again. Manual groups and exclusions are stored in D1 and survive refreshes. No source records are deleted.

Each group appears once in the table, filters and exports. Counts come from the primary listing and are never summed across mirrors; conflicting manual-group counts are flagged. Publisher listings with supported metadata are preferred. The group keeps its earliest discovery date, latest crawl date, and primary source publication date (or another known source date with its original provenance). Usage follows the most advanced existing status (Used, then Partially used, then New); subsequent changes apply to every source in the group. CSV includes all URLs and serialized source metadata; JSON includes the full source records. Source and text filters search all listings in a group.

Run `node --test tests/crawler.test.mjs tests/discovery.test.mjs tests/catalog-search.test.mjs tests/dataset-groups.test.mjs` for the full suite. Apply `0003_equal_titanium_man.sql` and `0004_amazing_yellowjacket.sql` to older local databases for usage and group metadata.

## Research use

Each candidate shows **Research use**: **Not searched** until a successful search, then the number of distinct papers found with abstract evidence of use. Open a record's **Search papers** control to run or repeat a search, edit the dataset search name, and inspect linked papers and evidence excerpts. Simple mentions are listed separately and excluded from the use count. **Search research · next 10** processes up to ten unsearched candidates from the current filtered list, sequentially, and can pause between datasets. Sorting by **Most papers found** and CSV/JSON exports include the saved indicators and coverage.

Searches use the public OpenAlex Works API, requesting the first 100 relevant works and their abstracts. This is a bounded search with heuristic evidence, not a full-text verification, citation count, or exhaustive total. Dataset aliases are derived from grouped source titles; users can refine ambiguous names. The matcher requires dataset-name boundaries and experimental language, excludes common negations/survey language, and deduplicates papers by DOI (or title/year). Missing abstracts and simple mentions do not count as evidence of use. Searches may miss genuine uses and can produce false positives: inspect the excerpts and original papers before relying on a result.

Results persist in D1 separately from crawl metadata. Zero means a successful search found no use evidence in the examined metadata; failed and unsearched states remain unknown. Failures preserve prior successful results. A shared lease and short cooldown serialize outgoing searches; successful searches are cached for one minute. No API key is required for this bounded integration, but OpenAlex can rate-limit public access. Rate-limit errors are shown and saved findings remain available. Research results are scoped to the group's source IDs: merging or separating datasets requires a fresh search for the new composition, preventing old results from being assigned to the wrong group.

Apply migration `0005_common_chameleon.sql` to an existing local preview. Include `tests/research.test.mjs` in the test command. `/api/research?id=…` reads a group's findings; `POST /api/research` accepts `{id, term?}` to search. Dataset/image files and paper PDFs are never downloaded.
