#!/usr/bin/env node

const APIFY_API = "https://api.apify.com/v2";
const ALLOWED_SOURCES = new Set(["google_maps", "google_search", "linkedin_profiles"]);

function argument(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function integerArgument(name, fallback, minimum, maximum) {
  const parsed = Number(argument(name, String(fallback)));
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    fail(`--${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function numberArgument(name, fallback, minimum, maximum) {
  const parsed = Number(argument(name, String(fallback)));
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    fail(`--${name} must be between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

const source = argument("source");
if (!source || !ALLOWED_SOURCES.has(source)) {
  fail("Choose --source=google_maps, --source=google_search or --source=linkedin_profiles.");
}
if (!process.argv.includes("--confirm-spend")) {
  fail("Add --confirm-spend after reviewing --max-items and --max-charge-usd.");
}

const token = process.env.APIFY_API_TOKEN?.trim();
if (!token) fail("APIFY_API_TOKEN is not configured in this shell.");

const query = argument("query", source === "linkedin_profiles" ? "Finance Director" : "mortgage broker");
const location = argument("location", "Sydney, Australia");
const maxItems = integerArgument("max-items", 10, 1, 25);
const maxChargeUsd = numberArgument("max-charge-usd", 0.5, 0.5, 0.5);
const timeoutSeconds = integerArgument("timeout-seconds", 120, 20, 180);

const definitions = {
  google_maps: {
    actorId: "compass~crawler-google-places",
    input: {
      searchStringsArray: [query],
      locationQuery: location,
      maxCrawledPlacesPerSearch: maxItems,
      language: "en",
      skipClosedPlaces: true,
      maxReviews: 0,
      scrapeImageAuthors: false,
    },
  },
  google_search: {
    actorId: "apify~google-search-scraper",
    input: {
      queries: `${query} ${location}`,
      maxPagesPerQuery: 1,
      resultsPerPage: 10,
      countryCode: "au",
      languageCode: "en",
      includeUnfilteredResults: false,
      saveHtml: false,
      saveHtmlToKeyValueStore: false,
    },
  },
  linkedin_profiles: {
    actorId: "harvestapi~linkedin-profile-search",
    input: {
      profileScraperMode: "Short",
      searchQuery: query,
      maxItems,
      takePages: 1,
      startPage: 1,
      locations: [location],
      autoQuerySegmentation: false,
      profileDeduplicationMode: "off",
    },
  },
};

async function apify(path, init = {}) {
  const response = await fetch(`${APIFY_API}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerMessage = json?.error?.message;
    throw new Error(typeof providerMessage === "string" ? providerMessage : `Apify returned ${response.status}`);
  }
  return json;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function fieldCoverage(rows, candidates) {
  const present = rows.filter((row) => candidates.some((key) => {
    const value = row?.[key];
    return value !== null && value !== undefined && value !== ""
      && (!Array.isArray(value) || value.length > 0);
  })).length;
  return rows.length ? Math.round((present / rows.length) * 100) : 0;
}

const definition = definitions[source];
const params = new URLSearchParams({
  waitForFinish: "0",
  build: "latest",
  maxItems: String(maxItems),
  maxTotalChargeUsd: maxChargeUsd.toFixed(2),
});
const startedAt = Date.now();

try {
  const started = await apify(`/acts/${definition.actorId}/runs?${params}`, {
    method: "POST",
    body: JSON.stringify(definition.input),
  });
  let run = started.data;
  const terminal = new Set(["SUCCEEDED", "FAILED", "TIMED-OUT", "ABORTED"]);
  while (!terminal.has(run.status) && Date.now() - startedAt < timeoutSeconds * 1_000) {
    await wait(2_000);
    run = (await apify(`/actor-runs/${encodeURIComponent(run.id)}`)).data;
  }
  if (!terminal.has(run.status)) {
    await apify(`/actor-runs/${encodeURIComponent(run.id)}/abort`, { method: "POST" }).catch(() => null);
    fail(`Actor Lab timed out after ${timeoutSeconds} seconds; run ${run.id} was sent an abort request.`);
  }
  if (run.status !== "SUCCEEDED") fail(`Actor run ${run.id} ended with ${run.status}.`);
  const rows = await apify(`/datasets/${encodeURIComponent(run.defaultDatasetId)}/items?clean=true&format=json&limit=${maxItems}`);
  const objectRows = Array.isArray(rows)
    ? rows.filter((row) => row && typeof row === "object" && !Array.isArray(row))
    : [];
  const candidateRows = source === "google_search"
    ? objectRows.flatMap((row) => Array.isArray(row.organicResults) ? row.organicResults : [])
    : source === "linkedin_profiles"
      ? objectRows.map((row) => {
        const currentPosition = Array.isArray(row.currentPositions) ? row.currentPositions[0] : null;
        return currentPosition && typeof currentPosition === "object"
          ? { ...row, companyName: currentPosition.companyName, jobTitle: currentPosition.title }
          : row;
      })
      : objectRows;
  const allKeys = [...new Set(objectRows.flatMap((row) => Object.keys(row)))].sort();
  const summary = {
    source,
    actorId: definition.actorId,
    actorRunId: run.id,
    actorBuildId: run.buildId ?? null,
    datasetId: run.defaultDatasetId ?? null,
    status: run.status,
    requested: maxItems,
    rawDatasetItems: objectRows.length,
    returned: candidateRows.length,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 100) / 10,
    usageTotalUsd: typeof run.usageTotalUsd === "number" ? run.usageTotalUsd : null,
    fieldCoveragePercent: {
      companyName: fieldCoverage(candidateRows, ["title", "name", "companyName", "currentCompanyName"]),
      personName: fieldCoverage(candidateRows, ["fullName", "name", "firstName"]),
      website: fieldCoverage(candidateRows, ["website", "websiteUrl", "url"]),
      phone: fieldCoverage(candidateRows, ["phone", "phoneUnformatted"]),
      email: fieldCoverage(candidateRows, ["email", "emails"]),
      linkedin: fieldCoverage(candidateRows, ["linkedinUrl", "profileUrl"]),
      addressOrLocation: fieldCoverage(candidateRows, ["address", "city", "location"]),
    },
    observedFields: allKeys,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} catch (error) {
  fail(error instanceof Error ? error.message : "The Actor Lab failed.");
}
