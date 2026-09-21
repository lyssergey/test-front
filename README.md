# Capture — a web interface for network traffic analysis

A front end for the Capture API simulator: sign in, build a query against the fields the server
publishes, follow a server-side search while it runs, and read one session in full.

Three screens, as the task asks: **sign in**, **search**, **session**.

---

## Running it

You need the API from the task repository on `http://localhost:8700` and Node 20.9+.

```bash
cd backend && uv sync && uv run capture-api serve
```

Then, in this repository:

```bash
npm install
cp .env.example .env.local
npm run dev
```

The app comes up on <http://localhost:3000>. The only setting is where the API lives:

```
CAPTURE_API_URL=http://localhost:8700
```

### Accounts

| email                   | password        | what you see                               |
| ----------------------- | --------------- | ------------------------------------------ |
| `ana@quillmere.example` | `demo-analyst`  | all three sensors, PCAP and file downloads |
| `oli@quillmere.example` | `demo-observer` | two sensors, no downloads                  |

Both are one click away on the sign-in screen.

### Scripts

| command                           | what it does                                  |
| --------------------------------- | --------------------------------------------- |
| `npm run dev`                     | dev server (Turbopack)                        |
| `npm run build` / `npm start`     | production build and serve                    |
| `npm run typecheck`               | TypeScript 7 (the native compiler)            |
| `npm run typecheck:ts6`           | TypeScript 6 — what the editor and ESLint use |
| `npm run lint`                    | ESLint, type-aware                            |
| `npm run format` / `format:check` | Prettier                                      |
| `npm run test:unit`               | Vitest — 85 tests                             |
| `npm run test:e2e`                | Playwright — 23 tests (needs the API running) |
| `npm run check`                   | both typechecks + lint + format + unit tests  |
| `npm run test:all`                | unit + e2e                                    |

---

## Stack, and one decision worth explaining

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript 7 · Tailwind CSS 4 · Radix UI ·
motion · TanStack Query 5 · TanStack Table 9 · TanStack Virtual · Zod · Vitest · Playwright.

**TypeScript 7 has to be installed alongside TypeScript 6, and which one owns the bare name
matters.** TS 7 is the native compiler: it ships without the old JavaScript compiler API that
`typescript-eslint` is built on, and refuses to load under it at all
(`typescript-eslint does not support TS 7.0`). The TS 7 release notes suggest a side-by-side
layout where TS 7 takes the `tsc` binary and the bare `typescript` name points at
`@typescript/typescript6`. I started there and moved off it: that package has no `lib/tsserver.js`,
so editors cannot use the workspace compiler and silently fall back to their own bundled one. The
result is phantom diagnostics — a reviewer sees errors that neither `tsc` nor CI reports.

So the bare name is plain TypeScript 6, which ships `tsserver.js`, and TS 7 lives under its own
name and is called by path:

```json
"typescript": "^6.0.3",
"typescript-7": "npm:typescript@^7.0.2"
```

```
npm run typecheck      → node node_modules/typescript-7/bin/tsc --noEmit   (7.0.2)
npm run typecheck:ts6  → tsc --noEmit                                       (6.0.3)
```

`npm run check` runs **both**, so a place where the two compilers disagree fails the build instead
of showing up only in somebody's editor. There is one such place already: TS 7 narrows
`buckets[hovered]` after a truthiness guard and TS 6 does not, which is why
[`histogram.tsx`](src/components/search/histogram.tsx) hoists it into a variable.
[`.vscode/settings.json`](.vscode/settings.json) points editors at the workspace TypeScript.

Two smaller pins for related reasons: **ESLint 9**, because `eslint-plugin-react` (bundled by
`eslint-config-next` 16) still uses the pre-10 rule-context API and crashes on ESLint 10; and
**Vite only under Vitest**, since Next 16 builds with Turbopack and the two bundlers cannot share
an app.

`npm run lint` prints exactly one warning, left in on purpose: React Compiler cannot memoize
`useVirtualizer()`, so it skips the results table. That is a real constraint of the library
combination, and hiding it behind a disable comment would make it invisible.

---

## How it is put together

### The upstream token never reaches the browser

The task asks that a HAR capture of the app contain no API token. Rather than encrypt the token
into a cookie — where the ciphertext still travels — the tokens stay in the server process and the
browser gets only an opaque session id:

```
browser ──cookie: capture_sid=<32 random bytes>──▶ Next route handler
                                                    │ looks the session up
                                                    │ attaches Bearer <access token>
                                                    ▼
                                                 Capture API
```

- [`src/server/session-store.ts`](src/server/session-store.ts) — the token store, keyed by session
  id. In memory, so a restart signs everyone out; it is the only file to swap for Redis.
- [`src/server/upstream.ts`](src/server/upstream.ts) — attaches the bearer token and keeps it
  fresh. The access token lives **90 seconds**, so refreshing is the normal case, not an edge case.
  The refresh token is single-use with zero grace, and re-presenting a consumed one revokes the
  whole family — so refreshes are **single-flight per session**: concurrent callers await one
  rotation instead of racing into a self-inflicted logout.
- [`src/app/api/capture/[...path]/route.ts`](src/app/api/capture/%5B...path%5D/route.ts) — the one
  door to the API. It streams bodies through untouched, so a PCAP or a carved file costs no more
  than a JSON page, and it forwards `Idempotency-Key`, `Retry-After`, `X-Limit-Applied` and friends.
- [`src/server/proxy-allowlist.ts`](src/server/proxy-allowlist.ts) — the proxy attaches a real
  credential to whatever it forwards, so the surface is listed explicitly rather than left open.
  `POST /api/capture/v1/cases` answers 403 `proxy_forbidden`.

The browser never sends an `Authorization` header of its own, and nothing it receives contains a
token. There is an end-to-end test that asserts exactly that — see below.

### Working with a search that runs on the server

This took the longest to get right, because the paging contract is subtler than it first reads.

- A search is created, polled, and its pages are read while it is still running.
- `next_cursor` present → follow it. `next_cursor: null` with `complete: false` → **caught up**:
  ask again shortly. `complete: true` → the end.
- The part that is easy to get wrong: re-reading the tail does **not** return the rows after it.
  It returns _that same window, grown_ — a superset. Appending it duplicates every row you already
  had. [`useSearchResults`](src/lib/api/search.ts) therefore keeps pages keyed by the cursor that
  produced them and replaces the tail page in place.
- A running search only serves its pages in scan order (`-ts`), whatever `sort` it was created
  with — asking for another is 409. So searches are always created with `-ts`, and the order the
  user picked is applied to the results once the job reports `done`. Column headers stay disabled
  until then, with the reason in their tooltip.
- Three searches per user, and one nobody reads holds its slot for ten minutes. The UI hands the
  slot back when a new search replaces the old one and when the page unloads. The search id lives
  in the URL, so in-app navigation to a session and back picks the same search up again.
- Auto-following stops after 2 000 rows and offers **Load more**, so a filter that matches 46 000
  sessions does not quietly pull all of them into memory.

### What is on screen, and what is left out

**Search.** Sensors (1–5, only the ones the account may read, with lag and decoder version on the
chip), a time window, and a condition builder generated from `/v1/meta/fields` — each field offers
only the operators the server publishes, enum values come from `/v1/meta/enums/{name}` with their
display labels, and arity is enforced (`in` takes 1–50 values, `between` exactly two, `exists`
none). Groups nest and can be negated.

Above the results: a live estimate from `/v1/estimate` before anything runs, and a timeline from
`/v1/histogram`. Buckets are placed by timestamp rather than by index, because buckets with no
capture are **omitted** upstream — a capture gap has to read as a hole, not as a quiet spell.
Bar heights on both charts here and the session's flow use a square-root scale: on a linear scale one busy bucket flattens every other one to an unreadable line, so the header states `√ scale` rather than let the heights read as proportional. Partial and under-covered buckets are coloured differently, and clicking a bar zooms the window to that bucket — offered only while a bucket is narrower than the window, since at one bucket per window the click would change nothing you could see. The window inputs carry seconds, because at this zoom level a minute is a long time.
When the filter uses `any`, `not` or nesting, the timeline says why it cannot be drawn instead of
showing something misleading: that endpoint only takes AND-ed conditions.

The results table takes its columns from `/v1/meta/columns`, in the server's order, with the
server's visibility defaults and width hints. Rows are virtualised, so thousands scroll without
the DOM growing. Undocumented column types render as text, as the spec instructs — the live API
already serves one (`geo_hint`), so this is not hypothetical.

The timeline is drawn from an estimate, without a search; the table needs one. That is easy to
miss, so the empty table says it and carries its own **Run search** button rather than pointing
at the header.

Every state has a screen: nothing run yet, scanning with no rows yet, caught up and waiting,
paused at the row budget, finished empty, expired, and failed — the last one showing the stable
`code` next to the message, and the validation list when a 422 arrives in FastAPI's shape.

**Session.** Header with both endpoints (enriched through `/v1/enrich/ips`), risk with the reasons
behind the score, detections with their MITRE technique, and PCAP/file downloads that disappear
when the account lacks the permission or the retention window has passed — with the reason on
hover. Then tabs: the transaction, a flow chart, carved files, neighbouring sessions between the
same two hosts, and the raw payload.

**HTTP is the hand-written view.** Request beside response, headers, body previews rendered as a
hex dump with an ASCII gutter when they arrive as hex. It reads both decoders: v2 sends headers as
`[{name, value}]` and numbers as numbers, v1 sends a header map and stringified numbers and omits
`truncated` entirely. Header values are marked `sensitive` by the schema, so they start masked,
with a per-value reveal and a reveal-all for the block.

**Everything else is built from the schema.** [`buildSchemaView`](src/lib/decoded/schema-view.ts)
reads `/v1/meta/schema/{protocol}` and turns the dotted paths into sections: scalars become
definition lists, `[]` paths with leaves under them become tables, leaf arrays become chips.
Nothing in it knows any protocol. Three things it handles on purpose:

- an array step accepts the v1 decoder's lone object where v2 sends a one-element array
  (`dns.authority`);
- keys in the payload that the schema does not publish get their own section rather than vanishing
  (`http.x_forwarded_for`);
- keys the schema publishes but whose payload has a **different shape** — the v1 decoder's
  `dns.rcode: "0"` against the declared `dns.rcode.code` / `dns.rcode.name` — are shown as they
  arrived, under "Shape differs from the schema". Without that, a real value silently disappears
  on one of the three sensors.

### Not done, and why

Everything below was optional in the task, and the task also says one finished thing beats five
started ones:

- **SSE detection feed, WebSocket live tap.** Not built. Both need a second server-side transport
  through the proxy (and the WS tap needs a minted ticket), which is a meaningful chunk of work
  next to polishing the three required screens. `/v1/detections` _is_ used — on the session screen
  and during the hunt below.
- **Saved hunts and cases.** Not built; not in the three screens, and they are the write-heavy part
  of the API. They are deliberately absent from the proxy allowlist too.
- **Search conversation graph** (`/v1/searches/{id}/graph`). Not rendered in the UI, although I
  used the endpoint directly to find the compromised host — see below. A graph view is the single
  thing I would add next, precisely because it is what cracked the incident.
- **Light theme.** Dark only.
- **Generated API client.** The types in [`src/lib/api/types.ts`](src/lib/api/types.ts) are
  hand-written from `openapi.json` for the parts the UI uses. A generator would hand back
  `Record<string, unknown>` for `decoded` anyway, and hand-writing let me encode the traps in the
  types — `SessionId` is a string because it is a uint64 that must never go through `Number()`.
- **Column reordering and resizing.** Visibility is there; order comes from the server.

---

## Tests

```bash
npm run test:unit   # 85 tests, ~1s
npm run test:e2e    # 23 tests, ~25s, needs the API on :8700
```

**Unit** ([Vitest](vitest.config.ts)) — the logic where a mistake is quiet rather than loud:

| file                                                                           | what it pins down                                                                                                                                                                               |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`src/lib/api/search.test.ts`](src/lib/api/search.test.ts)                     | the paging state machine: following a cursor, re-reading a grown tail without duplicating it, keeping earlier pages, 410 vs other failures, sort only on a finished search, stopping on unmount |
| [`src/lib/filter.test.ts`](src/lib/filter.test.ts)                             | filter building: operator arity, numeric coercion, field patterns, nesting and negation, the `field:op:value` form, and a round trip through the URL                                            |
| [`src/lib/search-url.test.ts`](src/lib/search-url.test.ts)                     | the URL contract: half a window is not a window, a mangled `q` falls back instead of reaching the API, and a generated link round-trips                                                         |
| [`src/lib/chart-scale.test.ts`](src/lib/chart-scale.test.ts)                   | the timeline's root scale: monotonic, peak at full height, a counted bucket never drawn as nothing                                                                                              |
| [`src/lib/format.test.ts`](src/lib/format.test.ts)                             | UTC-only formatting, the datetime-local round trip with and without seconds, and a negative duration staying visible                                                                            |
| [`src/lib/decoded/http.test.ts`](src/lib/decoded/http.test.ts)                 | v1 and v2 HTTP payloads normalising to one shape; absent `truncated` staying unknown rather than becoming `false`                                                                               |
| [`src/lib/decoded/schema-view.test.ts`](src/lib/decoded/schema-view.test.ts)   | path reading, the v1-object-for-array case, undocumented keys, shape mismatches                                                                                                                 |
| [`src/server/upstream.test.ts`](src/server/upstream.test.ts)                   | one refresh for six concurrent callers, 401-then-retry, no replay of a streamed body, session dropped when the refresh itself fails                                                             |
| [`src/server/proxy-allowlist.test.ts`](src/server/proxy-allowlist.test.ts)     | what the proxy will and will not forward                                                                                                                                                        |
| [`src/lib/api/client.test.ts`](src/lib/api/client.test.ts)                     | error normalisation, including FastAPI's 422 list and `Retry-After` as both seconds and an HTTP-date                                                                                            |
| [`src/components/search/cells.test.tsx`](src/components/search/cells.test.tsx) | grid cells, including an undocumented column type falling back to text                                                                                                                          |

**End-to-end** ([Playwright](playwright.config.ts)) — sign-in and sign-out, a wrong password, the
read-only account seeing fewer sensors, the proxy's allowlist and its 401, a search streaming rows
while still running, the empty result, an incomplete condition being refused, a shared link
reopening the same query and running it, opening a session from a row, the HTTP view, the
schema-driven view, and a session id that does not exist.

Two worth pointing at:

- **[`e2e/auth.spec.ts`](e2e/auth.spec.ts) → "the upstream token never reaches the browser"** —
  watches every response the app serves for token-shaped content, then checks the cookie is
  `httpOnly`, is not readable from `document.cookie`, does not look like an upstream token, and
  that `localStorage` and `sessionStorage` are empty. This is the requirement, asserted rather
  than asserted-to-be-true.
- **[`src/lib/api/search.test.ts`](src/lib/api/search.test.ts) → "waits and asks the same window
  again when it has caught up"** — encodes the paging semantics I got wrong the first time.

The suite runs single-worker on purpose: a user may hold only three searches at once, so specs
must not race each other for the slots, and each test hands back what it started. If a run is
interrupted hard, an orphaned search can hold a slot for up to ten idle minutes; restarting the
API clears it.

It is also patient rather than flaky: the API allows twelve searches a minute and one run starts
eight, so a second run inside the same minute waits the limit out instead of failing. A cold run
takes about 35 seconds, a rate-limited one about 50.

Two bugs these tests caught after the fact, both real: a `DurationCell` that was written but never
wired up (the cell test), and rows being appended twice on a development double-mount (the paging
test).

---

## Things that look wrong upstream

The task invites this, so: four findings, all reproducible.

1. **`backend/README.md` is missing from the task repository**, and `pyproject.toml` declares it as
   `readme`. Both `uv sync` and `docker compose build` fail on it:
   `failed to open file .../backend/README.md: No such file or directory`. I created a one-line
   stub locally to get the API up.
2. **The Dockerfile's entrypoint does not exist.** `CMD ["capture_api", "serve"]`, but
   `[project.scripts]` installs `capture-api` — `.venv/bin/` contains only the hyphenated name. So
   the container path is broken twice over, counting the README above.
3. **Some sessions end before they start.** `duration_ms` is negative for 21 of 5 000 sampled
   sessions (0.42%), all `tls` on `hq-core`, and `end` really does precede `start`
   (e.g. `start 11:53:05.194`, `end 11:53:04.667`, `duration_ms: -527`). The UI shows these in the
   warning colour with the reason on hover rather than hiding them — if the index can produce it,
   an analyst should see it.
4. **`/v1/meta/columns` serves an undocumented column type.** `dst_country` has type `geo_hint`,
   which is not in the documented enum. The spec says to render anything unknown as text, which is
   what happens; worth mentioning because a client that switches exhaustively on the documented
   enum would break on live data.

One more that is documented but easy to walk into: `Idempotency-Key` must be 8–64 characters of
`[A-Za-z0-9_-]`. A plausible-looking `probe-1` is rejected with 422 `invalid_idempotency_key`.

---

## Something is wrong in that traffic

**`ws-hb-009.quillmere.example` (10.20.40.18)**, behind the `harbor-branch` sensor, is the
compromised machine. It started at **2025-10-25T03:11:38Z**.

**Open it in the interface:**

- [Where it started](http://localhost:3000/search?sensors=harbor-branch&from=2025-10-25T02%3A00%3A00.000Z&to=2025-10-25T04%3A00%3A00.000Z&sort=ts&q=%7B%22field%22%3A%22src.ip%22%2C%22op%22%3A%22eq%22%2C%22value%22%3A%2210.20.40.18%22%7D&run=1)
  — everything the host did in the two hours around the first beacon. Nine sessions: the domain
  lookup, two NXDOMAIN probes, then the beacon starting.
- [The exfiltration](http://localhost:3000/search?sensors=harbor-branch&from=2025-10-26T01%3A00%3A00.000Z&to=2025-10-26T04%3A00%3A00.000Z&sort=-ts&q=%7B%22all%22%3A%5B%7B%22field%22%3A%22src.ip%22%2C%22op%22%3A%22eq%22%2C%22value%22%3A%2210.20.40.18%22%7D%2C%7B%22field%22%3A%22dst.ip%22%2C%22op%22%3A%22eq%22%2C%22value%22%3A%22198.51.100.225%22%7D%5D%7D&run=1)
  — 256 HTTP PUTs in one burst.

### The timeline

| when (UTC)                   | what                                                                                                                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **2025-10-25 03:11:38**      | `A telemetry.static-assets-cdn.test → 203.0.113.201` — the first trace of the host ever asking for that domain. Risk 46, and nothing like it in the preceding 15 hours. |
| 03:11:48, 03:12:02           | `NXDOMAIN 71dbe240.static-assets-cdn.test`, `NXDOMAIN 96a10af4.static-assets-cdn.test` — random labels under the same brand-new domain, a fallback-channel pattern.     |
| **03:26:56**                 | First TLS session to `203.0.113.201:443`, SNI `telemetry.static-assets-cdn.test`.                                                                                       |
| 03:26 → end of capture       | **608 TLS sessions**, every 5–6 minutes (median gap 333 s, one 22-minute miss), ~1 kB up and ~3 kB down each. A beacon.                                                 |
| **2025-10-26 01:17 → 03:43** | **256 HTTP PUTs** to `198.51.100.225:80`, paths `/bkt/<hex>/<hex>.bin`, **1.26 GB up against 77 kB down**. Staged exfiltration.                                         |

Both peers come back `suspicious` from `/v1/enrich/ips` (AS64500 Thornrise Cloud Services, AT; and
AS64498 Bluequay Networks, CH).

### How I found it

Detections were no help, which is the point of the exercise: the seven built-in rules fire across
dozens of hosts, and the released feed only covers the live tail from 2025-10-27 10:02 onwards —
more than two days after this began. Nothing in it points at the origin.

What worked was asking a question the rules do not: **which internal host talks to an external
address that nobody else talks to?** I ran a search across the whole 72 hours filtered to
`dst.country exists` — which is exactly "external", since the country is absent for internal
addresses — and read its conversation graph (`/v1/searches/{id}/graph`, 344 nodes, 9 538 edges).
Of 59 external peers, exactly **two** were contacted by a single internal host, and both belonged
to 10.20.40.18: one with 608 sessions and 2.6 MB, one with 256 sessions and 1.26 GB. From there it
was one filtered search per peer to get the protocol, cadence and start time, and one more over
the host's whole timeline to find the DNS lookup that precedes the first beacon.

This was the one step I did against the API directly rather than through the screens, because the
graph endpoint has no view in this UI yet. Everything it told me is reproducible in the interface
through the links above; nothing came from reading the simulator's source.

### What I ruled out

- **The eight other hosts the beacon rule flags.** They beacon to `198.51.100.10`, which 109
  distinct internal hosts contact over the same window and which enrichment calls `clean` — vendor
  update telemetry. The rule cannot tell that apart from a C2 channel; the "who else talks to this
  peer" question can.
- **Suspected DNS tunnelling.** Fires on ~20 hosts including domain controllers and the mail
  relay, for long random labels under ordinary domains. Harmless, and it fires on 10.20.40.18 too —
  against the _internal_ resolver, which is the same noise as everywhere else.
- **Rare HTTP user agent**, including one on this very host (`curl/7.29.0` to `api.example.net`, a
  clean peer). A decoy: the real channel is TLS with an unremarkable fingerprint.
- **SMB mass read, clear-text credentials, lookalike sender.** Different hosts, none correlating
  with the two suspicious peers.
- **Volume alone.** Several hosts pull hundreds of MB down from CDNs. What singles this one out is
  the _direction_: 1.26 GB **up** to a single-use peer.

A note on the design: this host sits behind `harbor-branch` — the sensor that lags 300 seconds and
runs the legacy v1 decoder. The compromise is behind the hardest data to read, which is why the
v1/v2 normalisation above is not busywork.

---

## Where AI was used

All of it was written in one session with Claude Code (Opus 5), including this README. That is the
honest picture; what is worth recording is where the first attempt was wrong and what the live API
had to correct:

- **The paging contract.** The first version treated a caught-up re-read as "the rows after this
  point" and appended it. That duplicated every row — visible in the UI as each session listed two
  to four times, and in the console as duplicate-key errors. Probing the endpoint by hand showed
  that a cursor-less re-read returns the whole window grown, which is why pages are now keyed by
  cursor and the tail is replaced. The test named above exists because of this.
- **Sorting.** The first version passed the user's `sort` to the results endpoint and created the
  search with it. A shared link with `sort=ts` then failed with 409 on every page. A running search
  serves its pages in scan order only, so searches are created with `-ts` and the chosen order is
  applied after completion.
- **Search slots.** Reloading the page orphaned the previous search until it idled out, and a few
  reloads exhausted all three slots. Fixed with a release on `pagehide` and by keeping the search
  id in the URL.
- **A cell that was written but never wired in.** `DurationCell` existed, with the negative-duration
  handling, while the switch still returned the old inline markup. The component test caught it.
- **Prettier's Tailwind plugin ate a space** in a template-literal class name, silently producing
  `ml-autotext-2xs`. Rewritten through `cn()`.
- **Every lint finding was fixed rather than suppressed** — a `setState` in an effect became
  derived state, a thrown object became an `Error`, `String(unknown)` got narrowed. The one
  remaining warning is the React Compiler / TanStack Virtual incompatibility, kept visible on
  purpose.
- **The TypeScript 7 layout, twice.** First attempt: the side-by-side arrangement from the release
  notes, verified by peer ranges and by running both compilers. It worked for `tsc` and for ESLint,
  and then showed a type error in a reviewer's editor that neither reported — because the TS 6
  package in that layout has no `tsserver.js`, so the editor was using its own bundled compiler.
  Rebuilt with plain TypeScript 6 on the bare name, TS 7 under an alias called by path, both
  typechecks in `npm run check`, and an editor setting pointing at the workspace compiler. The one
  genuine disagreement between the two versions is fixed in `histogram.tsx`.
- **A window guessed from the wall clock, twice.** The first render, before `/v1/health` answers,
  built a "last 6 hours" window from `Date.now()`. The capture sits eleven months behind, so
  `/v1/estimate` and `/v1/histogram` answered 400 on every page load. The gate had to travel
  _through_ the debounce with the value, not beside it, or it turns true while the window it guards
  is still the guessed one.

  A later audit found the same root cause surviving in a narrower case, and that one was a genuine
  hydration mismatch: on a link carrying `from` but no `to` — a truncated or hand-edited share URL
  — the "window is real" gate passed on `from` alone, so the guessed end bound reached the DOM as
  the histogram's end label and the datetime-local input's value, computed against the server's
  clock on the server pass and the browser's on the first client render. Fixed at the source rather
  than the symptom: `readSearchUrl` treats a window as indivisible (both bounds or neither), takes
  no clock-derived defaults, and the window stays `null` until the capture clock arrives, so the
  deterministic skeleton is the only thing either pass can render. Verified against the served
  HTML — that URL's SSR output no longer contains a wall-clock timestamp.
  [`src/lib/search-url.test.ts`](src/lib/search-url.test.ts) pins it, and writing it caught
  `parseFilter` accepting a JSON array, since `typeof [] === "object"`.

  Worth recording what the same audit **rejected**: adding `suppressHydrationWarning` to the login
  fields. A password manager or temp-mail extension decorates those inputs before React hydrates,
  which produces a hydration warning that reads as an app bug and is not one — the served HTML
  carries no `style` or `data-*` on either input, and neither string appears anywhere in `src/`.
  Suppressing it would have hidden the symptom at the cost of masking real attribute mismatches on
  exactly the two fields most worth checking, so it was not added.

- **Cancel did not visibly cancel.** Deleting a search upstream makes it _gone_, not
  `cancelled` — the next status poll answers 404 — and TanStack Query keeps the last good data
  alongside an error, so the strip went on claiming `running` with a 404 card beside it. Now
  cancelling ends the job locally, keeps the rows already read (which is why you cancelled) and
  shows no error for an outcome the user asked for. An end-to-end test asserts each of those.
- **A missing app icon**, which was the `/favicon.ico` 404 in the console.

The incident conclusion is mine from the data, not from the simulator's source, which I did not
read.
