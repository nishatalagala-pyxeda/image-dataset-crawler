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

Publication dates are separate from `foundAt` (first discovery) and `crawledAt` (latest crawl attempt). For HTML pages the crawler accepts explicit primary Dataset/Page JSON-LD `datePublished` or published/issued meta tags. It never treats paper citations, copyright years, modification dates, or crawl timestamps as publication dates. For Hugging Face it requests `createdAt` and labels this **Repository created**, with its source URL and evidence. Repository creation is a hosting-date proxy; it does not prove the original dataset release date or when an originally private repository became public. The **Date evidence** selector can exclude repository creation proxies. Missing/invalid dates stay unknown. Refresh existing records to collect available dates for older entries; a later page lacking that field does not erase a previously collected date.

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
