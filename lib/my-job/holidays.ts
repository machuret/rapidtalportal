/**
 * Curated public-holiday data for the My Job → Holiday calendars feature.
 *
 * RapidTal-maintained (no external API): Australian holidays vary by state
 * (NSW vs VIC genuinely differ), shown side by side with Philippine holidays
 * so VA and client agree upfront which apply.
 *
 * CURATED FOR 2026 — movable dates (Easter, King's Birthday, Labour Day, Eid)
 * shift each year. Refresh this file annually; HOLIDAY_YEAR drives the UI note.
 */

export const HOLIDAY_YEAR = 2026;

export interface Holiday {
  date: string;   // ISO yyyy-mm-dd
  name: string;
}

export interface HolidayRegion {
  id: string;
  label: string;
  country: "AU" | "PH";
  holidays: Holiday[];
}

// National Australian holidays (apply in every state/territory).
const AU_NATIONAL: Holiday[] = [
  { date: "2026-01-01", name: "New Year's Day" },
  { date: "2026-01-26", name: "Australia Day" },
  { date: "2026-04-03", name: "Good Friday" },
  { date: "2026-04-04", name: "Easter Saturday" },
  { date: "2026-04-06", name: "Easter Monday" },
  { date: "2026-04-25", name: "Anzac Day" },
  { date: "2026-12-25", name: "Christmas Day" },
  { date: "2026-12-26", name: "Boxing Day" },
];

// State-specific additions (on top of the national set).
const AU_STATE_EXTRAS: Record<string, { label: string; extra: Holiday[] }> = {
  nsw: {
    label: "Australia — NSW",
    extra: [
      { date: "2026-06-08", name: "King's Birthday" },
      { date: "2026-08-03", name: "Bank Holiday (banks only)" },
      { date: "2026-10-05", name: "Labour Day" },
    ],
  },
  vic: {
    label: "Australia — VIC",
    extra: [
      { date: "2026-03-09", name: "Labour Day" },
      { date: "2026-06-08", name: "King's Birthday" },
      { date: "2026-09-25", name: "Friday before AFL Grand Final (typical)" },
      { date: "2026-11-03", name: "Melbourne Cup Day" },
    ],
  },
  qld: {
    label: "Australia — QLD",
    extra: [
      { date: "2026-05-04", name: "Labour Day" },
      { date: "2026-10-05", name: "King's Birthday" },
    ],
  },
  wa: {
    label: "Australia — WA",
    extra: [
      { date: "2026-03-02", name: "Labour Day" },
      { date: "2026-06-01", name: "Western Australia Day" },
      { date: "2026-09-28", name: "King's Birthday (typical)" },
    ],
  },
  sa: {
    label: "Australia — SA",
    extra: [
      { date: "2026-03-09", name: "Adelaide Cup Day" },
      { date: "2026-06-08", name: "King's Birthday" },
      { date: "2026-10-05", name: "Labour Day" },
    ],
  },
  tas: {
    label: "Australia — TAS",
    extra: [
      { date: "2026-02-09", name: "Royal Hobart Regatta (south)" },
      { date: "2026-03-09", name: "Eight Hours Day" },
      { date: "2026-06-08", name: "King's Birthday" },
    ],
  },
  act: {
    label: "Australia — ACT",
    extra: [
      { date: "2026-03-09", name: "Canberra Day" },
      { date: "2026-06-08", name: "King's Birthday" },
      { date: "2026-10-05", name: "Labour Day" },
    ],
  },
  nt: {
    label: "Australia — NT",
    extra: [
      { date: "2026-05-04", name: "May Day" },
      { date: "2026-06-08", name: "King's Birthday" },
      { date: "2026-08-03", name: "Picnic Day" },
    ],
  },
};

// Philippines — regular holidays + the major special (non-working) days.
// Islamic holidays (Eid'l Fitr / Eid'l Adha) are proclamation-based and
// approximate until the official dates are announced.
const PH_HOLIDAYS: Holiday[] = [
  { date: "2026-01-01", name: "New Year's Day" },
  { date: "2026-02-17", name: "Chinese New Year (special)" },
  { date: "2026-02-25", name: "EDSA People Power (special)" },
  { date: "2026-04-02", name: "Maundy Thursday" },
  { date: "2026-04-03", name: "Good Friday" },
  { date: "2026-04-04", name: "Black Saturday (special)" },
  { date: "2026-04-09", name: "Araw ng Kagitingan" },
  { date: "2026-05-01", name: "Labor Day" },
  { date: "2026-06-12", name: "Independence Day" },
  { date: "2026-08-21", name: "Ninoy Aquino Day (special)" },
  { date: "2026-08-31", name: "National Heroes' Day" },
  { date: "2026-11-01", name: "All Saints' Day (special)" },
  { date: "2026-11-30", name: "Bonifacio Day" },
  { date: "2026-12-08", name: "Immaculate Conception (special)" },
  { date: "2026-12-25", name: "Christmas Day" },
  { date: "2026-12-30", name: "Rizal Day" },
  { date: "2026-12-31", name: "Last Day of the Year (special)" },
];

export const PH_REGION: HolidayRegion = {
  id: "ph",
  label: "Philippines",
  country: "PH",
  holidays: [...PH_HOLIDAYS].sort((a, b) => a.date.localeCompare(b.date)),
};

/** All selectable AU regions (state = national + its extras), sorted by date. */
export const AU_REGIONS: HolidayRegion[] = Object.entries(AU_STATE_EXTRAS).map(([id, { label, extra }]) => ({
  id,
  label,
  country: "AU" as const,
  holidays: [...AU_NATIONAL, ...extra].sort((a, b) => a.date.localeCompare(b.date)),
}));

export function auRegion(id: string): HolidayRegion {
  return AU_REGIONS.find((r) => r.id === id) ?? AU_REGIONS[0];
}
