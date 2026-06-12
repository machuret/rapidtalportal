/**
 * Placement Notebook starter templates — the differentiator. When a placement
 * goes active these six pages are copied in (fully editable/deletable per
 * placement) so a new engagement has a working structure on day one.
 *
 * Content is TipTap JSON. Builders below keep the documents readable; they emit
 * plain JSON objects so this module is safe to import server-side without
 * pulling in the editor runtime.
 */
export type JSONNode = Record<string, unknown>;

export interface TemplatePage {
  title: string;
  content: JSONNode;
  children?: TemplatePage[];
}

// ---- tiny TipTap-JSON builders -------------------------------------------
const text = (value: string, marks?: JSONNode[]): JSONNode =>
  marks ? { type: "text", text: value, marks } : { type: "text", text: value };
const strong = (value: string): JSONNode => text(value, [{ type: "bold" }]);
const para = (...inline: JSONNode[]): JSONNode =>
  ({ type: "paragraph", content: inline.length ? inline : undefined });
const heading = (level: number, value: string): JSONNode =>
  ({ type: "heading", attrs: { level }, content: [text(value)] });
const hr = (): JSONNode => ({ type: "horizontalRule" });

const listItem = (value: string): JSONNode =>
  ({ type: "listItem", content: [para(text(value))] });
const bullets = (lines: string[]): JSONNode =>
  ({ type: "bulletList", content: lines.map(listItem) });
const ordered = (lines: string[]): JSONNode =>
  ({ type: "orderedList", content: lines.map(listItem) });

const taskList = (items: { text: string; checked?: boolean }[]): JSONNode =>
  ({
    type: "taskList",
    content: items.map((it) => ({
      type: "taskItem",
      attrs: { checked: !!it.checked },
      content: [para(text(it.text))],
    })),
  });

const cell = (value: JSONNode, header = false): JSONNode =>
  ({
    type: header ? "tableHeader" : "tableCell",
    attrs: { colspan: 1, rowspan: 1, colwidth: null },
    content: [para(value)],
  });
const table = (headers: string[], rows: string[][]): JSONNode => ({
  type: "table",
  content: [
    { type: "tableRow", content: headers.map((h) => cell(strong(h), true)) },
    ...rows.map((r) => ({ type: "tableRow", content: r.map((c) => cell(text(c))) })),
  ],
});

const doc = (...nodes: JSONNode[]): JSONNode => ({ type: "doc", content: nodes });

// ---- the six templates ----------------------------------------------------
export function placementTemplates(): TemplatePage[] {
  return [
    {
      title: "Onboarding Checklist",
      content: doc(
        heading(1, "Onboarding Checklist"),
        para(text("Work through this together in the first week. Tick items as you go.")),
        taskList([
          { text: "Accounts & access granted" },
          { text: "Tools installed and tested" },
          { text: "Intro call done" },
          { text: "Working hours agreed" },
          { text: "Communication channel confirmed (Microsoft Teams)" },
          { text: "First-week tasks agreed" },
        ]),
        heading(3, "First-week tasks"),
        bullets([
          "Read the Company DNA and key SOPs",
          "Shadow / review existing work for context",
          "Set up the weekly report cadence",
        ]),
      ),
    },
    {
      title: "SOPs",
      content: doc(
        heading(1, "SOPs"),
        para(text("Standard Operating Procedures for this placement. Add one child page per repeatable process. Start from the SOP Template below.")),
      ),
      children: [
        {
          title: "SOP Template",
          content: doc(
            heading(1, "SOP: <name>"),
            para(strong("Purpose — "), text("what this procedure achieves and why it matters.")),
            para(strong("Trigger — "), text("when this SOP should be run (event, schedule, or request).")),
            heading(3, "Steps"),
            ordered([
              "First step — be specific and actionable",
              "Second step",
              "Third step",
            ]),
            heading(3, "Tools used"),
            bullets(["Tool / platform 1", "Tool / platform 2"]),
            para(strong("Owner — "), text("who is responsible.")),
            para(strong("Last reviewed — "), text("YYYY-MM-DD")),
          ),
        },
      ],
    },
    {
      title: "Access & Accounts Register",
      content: doc(
        heading(1, "Access & Accounts Register"),
        para(
          strong("⚠ Never store passwords here. "),
          text("This page records WHERE credentials live (which password manager / vault), not the credentials themselves. Use a password manager for secrets and share access through it."),
        ),
        hr(),
        table(
          ["Tool / Platform", "URL", "Account email", "Password held in"],
          [
            ["Example: Google Workspace", "https://workspace.google.com", "name@company.com", "1Password — Shared vault"],
            ["", "", "", ""],
            ["", "", "", ""],
          ],
        ),
      ),
    },
    {
      title: "Weekly Report",
      content: doc(
        heading(1, "Weekly Report"),
        para(text("Duplicate this structure each week (or keep a running log under dated headings).")),
        heading(3, "Wins this week"),
        bullets(["…"]),
        heading(3, "Completed tasks"),
        bullets(["…"]),
        heading(3, "In progress"),
        bullets(["…"]),
        heading(3, "Blocked / needs client input"),
        bullets(["…"]),
        heading(3, "Next week's plan"),
        bullets(["…"]),
      ),
    },
    {
      title: "Content Calendar",
      content: doc(
        heading(1, "Content Calendar"),
        para(text("Plan and track content. Status: idea → drafting → review → scheduled → published.")),
        table(
          ["Date", "Channel", "Topic", "Status", "Link to draft"],
          [
            ["", "", "", "idea", ""],
            ["", "", "", "idea", ""],
            ["", "", "", "idea", ""],
          ],
        ),
      ),
    },
    {
      title: "Meeting Notes",
      content: doc(
        heading(1, "Meeting Notes"),
        para(text("Add one child page per meeting, newest first. Start from the template below.")),
      ),
      children: [
        {
          title: "Meeting — <date>",
          content: doc(
            heading(1, "Meeting — YYYY-MM-DD"),
            para(strong("Attendees: "), text("…")),
            heading(3, "Decisions"),
            bullets(["…"]),
            heading(3, "Action items"),
            taskList([
              { text: "Action — owner — due date" },
              { text: "Action — owner — due date" },
            ]),
          ),
        },
      ],
    },
  ];
}
