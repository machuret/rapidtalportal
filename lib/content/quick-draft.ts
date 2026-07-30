import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import type {
  ContentBrief,
  ContentEvidenceOption,
  ContentPiece,
  ContentProject,
} from "@/types/content";

interface QuickDraftInput {
  clientId: string;
  project: ContentProject;
  brief: ContentBrief;
}

interface GenerationResponse {
  id: string;
  body: string;
  sources?: ContentPiece["source_references"];
  styleSnapshot?: ContentPiece["style_snapshot"];
}

export interface QuickDraftResult {
  project: ContentProject;
  piece: ContentPiece;
}

/**
 * Moves a project through the real guarded workflow and generates a grounded
 * draft without asking the editor to operate each intermediate screen.
 *
 * Keeping this orchestration shared prevents the home-page fast path and the
 * in-project fast path from drifting into different transition behaviour.
 */
export async function generateQuickDraft({
  clientId,
  project,
  brief,
}: QuickDraftInput): Promise<QuickDraftResult> {
  let current = project;

  if (current.current_step === "idea") {
    current = await api.patch<ContentProject>(
      ROUTES.content.projects(),
      {
        client_id: clientId,
        id: current.id,
        expected_updated_at: current.updated_at,
        content_brief: brief,
        current_step: "brief",
        status: "active",
      },
      { showErrorToast: false },
    );
  }

  if (current.current_step === "brief") {
    current = await api.patch<ContentProject>(
      ROUTES.content.projects(),
      {
        client_id: clientId,
        id: current.id,
        expected_updated_at: current.updated_at,
        content_brief: brief,
        current_step: "evidence",
        status: "active",
      },
      { showErrorToast: false },
    );
  }

  if (current.current_step === "evidence") {
    const available = await api.get<ContentEvidenceOption[]>(
      ROUTES.content.projectEvidence(clientId, current.id),
      { showErrorToast: false },
    );
    const automaticSourceIds = current.vault_source_ids.length
      ? current.vault_source_ids
      : available.slice(0, 6).map((source) => source.id);
    current = await api.patch<ContentProject>(
      ROUTES.content.projects(),
      {
        client_id: clientId,
        id: current.id,
        expected_updated_at: current.updated_at,
        vault_source_ids: automaticSourceIds,
        current_step: "generate",
        status: "active",
      },
      { showErrorToast: false },
    );
  }

  if (current.current_step !== "generate") {
    throw new Error("This draft is not ready for quick generation. Reload it and try again.");
  }

  const generated = await api.post<GenerationResponse>(
    ROUTES.content.generate(),
    {
      clientId,
      projectId: current.id,
      vaultSourceIds: current.vault_source_ids,
      contentType: current.idea_snapshot.channel,
      title: current.title,
      brief,
    },
    { showErrorToast: false },
  );
  const loaded = await api.get<ContentProject>(
    ROUTES.content.project(clientId, current.id),
    { showErrorToast: false },
  );
  const piece = loaded.current_piece ?? {
    id: generated.id,
    project_id: current.id,
    content_type: current.idea_snapshot.channel,
    title: current.title,
    body: generated.body,
    content_brief: brief,
    source_references: generated.sources ?? [],
    style_snapshot: generated.styleSnapshot ?? current.style_snapshot,
    status: "draft",
    created_at: new Date().toISOString(),
  };

  return { project: loaded, piece };
}
