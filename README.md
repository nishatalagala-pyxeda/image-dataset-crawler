# Dataset Observatory

A metadata-only crawler and searchable web catalog for image classification datasets.

## Use

Click **Run a crawl**. Leave starting pages empty for the public starter sources (CIFAR, Oxford Flowers, Oxford Pets, Food-101, and the Hugging Face image-classification directory), or enter up to 20 public dataset/directory URLs. Choose a budget of 5–40 pages. Keep the tab open while crawling. Closing or pausing leaves the queue saved; **Resume crawl** continues it.

The crawler follows relevant dataset/classification links one level beyond starting pages. This is bounded discovery from public directories and supplied URLs, not an exhaustive web search engine. JavaScript-only sites, login-protected pages, inaccessible robots files, and pages larger than 700 KB are skipped with an activity log entry. Robots rules are checked before each page and redirect. A one-second pause separates page inspections.

The catalog stores a generated name, image subject, category count, expected image count, dataset page URL, first discovery timestamp, latest crawl attempt, latest successful inspection, source evidence, and fetch errors. Dates display in the viewer's timezone; exports preserve ISO timestamps. Upserts preserve discovery dates. Failed rechecks preserve existing metadata and record the failed attempt separately.

**Metadata matches** have supported structured counts or a publisher-specific parser. **Needs review** contains heuristic candidates, including missing counts. These are clearly marked; unknown counts are never replaced with invented values. Counts can represent a publisher's splits or largest documented configuration. They are estimates from metadata, not independently counted images. Different catalog entries may overlap.

Click a dataset name for evidence. Use the source link to visit its dataset page. CSV and JSON buttons export the current search/filter results; `/api/export` and `/api/export?format=json` export the full persisted catalog.

## Implementation

- React / Vinext UI, Cloudflare Worker routes, D1 / Drizzle persistent records and crawl jobs.
- `lib/crawler.mjs`: restricted page fetcher, robots checks, structured Hugging Face metadata, publisher and generic HTML extraction, bounded link discovery, CSV escaping.
- `lib/catalog.ts`: crawl queue, atomic page-processing lease, deduplication, timestamp preservation, error history.
- `db/schema.ts`, `drizzle/`: database schema and migrations.
- `app/api/`: catalog, crawl start/step, exports.
- `tests/crawler.test.mjs`: meaningful parser, robots, URL restrictions, discovery, configuration-count and export tests.

No dataset archives, images, labels files, or dataset contents are requested. Only HTML/text/JSON metadata responses are accepted, capped while streaming. File extensions, download endpoints, credentials, IP literals, local hostnames and nonstandard ports are rejected. Production runs on Cloudflare's outbound networking restrictions. Do not expose a local development server to untrusted clients.

## Development

Requires Node 22.13+ and a current npm. Install with the Sites `install-dependencies.mjs` helper (or `npm run install:ci` outside Sites). The hosting manifest declares the `DB` D1 binding.

```sh
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_smooth_groot.sql
npm run dev
```

```sh
node --test tests/crawler.test.mjs
node node_modules/typescript/bin/tsc --noEmit
```

Apply the local schema once to a fresh preview database. Sites applies committed migrations to the separate hosted database during deployment. Future schema changes use `npm run db:generate` and new migrations.

Crawls run on demand. There is no automatic schedule enabled. Production records are separate from local preview records. No API keys are required for the public sources.
