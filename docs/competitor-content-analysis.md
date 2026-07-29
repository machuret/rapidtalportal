# Competitor Content Analysis for the Content Suite

## Delivery status

Phase 1 source collection is implemented in migrations 095–097 and the Content
workspace. Client and super admins can add competitors; attach website, blog,
single-page, sitemap, feed, newsletter-archive and social-profile URLs; choose
exact, path or domain scope; set page limits and refresh cadence; and inspect
source health, complete capture history and captured text. Website sources use
leased, versioned crawl jobs with durable provider-page staging and bounded
ingestion batches. Supplied sitemap and RSS URLs are parsed directly, canonical
apex/`www` redirects remain in scope, and all provider continuations are pinned
to Firecrawl's HTTPS API origin.

Pause requests cancel active collection instead of allowing a worker to
reactivate the source. Transient failures use exponential retry scheduling.
Completed authoritative crawls mark material that disappeared at the source.
Atomic daily crawl and page reservations enforce a database-backed tenant
budget for both manual and scheduled refreshes. Social and YouTube URLs remain
registered as `connector_required` until an approved API, connector or
user-provided export is available.

## Product position

Competitor analysis should be a market-intelligence layer, not a writing authority.

- Company DNA remains the authority for voice, style, claims and hard rules.
- The Vault remains the authority for the company’s own factual knowledge.
- Competitor material can suggest topics, formats, audience questions and gaps.
- Competitor material must never be treated as factual support for the client’s claims.
- The engine should analyse patterns and opportunities, not imitate distinctive wording.

This separation prevents a competitor’s tone from leaking into the client’s voice and prevents competitor claims from being repeated as though they were verified company facts.

## Recommended workflow

1. An admin adds a competitor with its name, website and known public channel URLs.
2. The system discovers first-party public material: website pages, blog posts, RSS items, newsletters supplied by the user, and social content obtained through an approved API or export.
3. Every captured item retains its public URL, channel, publication date, capture date and content hash.
4. The analyser produces structured observations:
   - topic and subtopic;
   - audience problem or intent;
   - format and platform;
   - hook pattern;
   - CTA pattern;
   - tone descriptors;
   - proof type used, without accepting the proof as true;
   - funnel stage;
   - publishing cadence;
   - recurring themes and gaps.
5. A market-opportunity view compares competitors with the client’s existing content and approved topics.
6. The editor may add a selected opportunity to a Content Brief. The brief stores the insight and source links, but generation still follows Company DNA and uses only the client Vault for factual grounding.

## Content-suite integration

### Competitor workspace

The workspace should show:

- competitors and source health;
- channel and publishing cadence;
- dominant and emerging topics;
- common formats and CTA patterns;
- duplicated themes across the market;
- under-served audience questions;
- recent notable content with source links;
- analysis confidence and last refresh time.

### Topic discovery

Topic suggestions should gain a new origin: `competitor_opportunity`.

Each suggestion should explain:

- what competitors cover;
- what they appear to miss;
- why the topic is relevant to the client’s audience;
- how the client can add a distinct point of view;
- which Company DNA service or goal it supports;
- the public competitor sources used for the observation.

The system should favour differentiated opportunities over “write the same article”.

### Structured Content Brief

Add an optional `competitiveContext` object:

```json
{
  "opportunityId": "uuid",
  "marketPattern": "Most competitors explain setup but not ongoing ownership.",
  "differentiation": "Focus on the hand-off checklist and owner visibility.",
  "avoidImitating": ["competitor slogans", "distinctive headings"],
  "sourceUrls": ["https://competitor.example/article"]
}
```

The prompt should label this block as untrusted market observation. It may influence topic, angle and format, but cannot override Company DNA or supply factual claims.

### Provenance

Persist competitor references separately from `source_references`:

- `source_references` means client-owned factual support from the Vault.
- `competitor_references` means public market context used to choose the angle.

The editor should display both, with different labels and colours, so users cannot mistake competitive inspiration for claim evidence.

## Suggested data model

- `competitors`
  - tenant, name, website, status, refresh cadence.
- `competitor_channels`
  - competitor, platform, public URL, acquisition method.
- `competitor_content_items`
  - source URL, platform, title, public text, published date, content hash, capture metadata.
- `competitor_content_analyses`
  - structured topics, intent, format, hook, CTA, tone, proof type, model/version and confidence.
- `competitor_opportunities`
  - market pattern, content gap, differentiation suggestion, supporting item IDs, status.
- `content_piece_competitor_references`
  - lineage between a draft and the market observations that influenced its angle.

Every table must carry `client_id`, enforce RLS, and be tenant-qualified again in service-role routes.

## Acquisition guidance

Start with sources that are reliable and legally straightforward:

1. Website pages, blogs and RSS feeds.
2. Public URLs pasted by the user.
3. Newsletter emails forwarded or uploaded by the user.
4. Official platform APIs or user-provided exports.

Do not begin with unsupported bulk scraping of LinkedIn, Facebook or Instagram. Platform access, retention and display rules change, and an ingestion design should not depend on bypassing them.

## MVP recommendation

### Stage A — website and manual-source intelligence

- Add competitors and public URLs.
- Crawl website/blog/RSS.
- Analyse topics, formats, hooks and CTAs.
- Show overlap and gap reports.
- Create reviewable topic opportunities.

### Stage B — Content Brief integration

- Add selected opportunities to the brief.
- Persist separate competitor provenance.
- Add “differentiate from the market” instructions.
- Test that competitor wording, voice and claims cannot override Company DNA.

### Stage C — channel connectors

- Add approved social APIs and newsletter ingestion.
- Track cadence and topic movement over time.
- Alert on emerging themes and stale client coverage.

### Stage D — evaluation

- Measure whether suggested opportunities are approved.
- Measure diversity and duplication, not performance-to-style learning.
- Keep editorial approval as the signal for opportunity usefulness.

## Guardrails and tests

- Competitor text is always marked untrusted.
- Competitor evidence can never satisfy the unsupported-claim gate.
- Generated text is checked for suspicious phrase overlap with captured competitor material.
- No automatic Company DNA updates.
- Promoting an insight into Company DNA requires an explicit admin action.
- Tenant-isolation tests cover every competitor endpoint and background job.
- Deletion removes captured competitor content and derived analysis.
- Every analysis stores source URLs, capture time, model and analysis version.
