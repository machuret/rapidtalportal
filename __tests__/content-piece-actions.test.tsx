import { act, renderHook } from "@testing-library/react";
import { toast } from "sonner";
import { usePieceActions } from "@/components/content/library/usePieceActions";
import { useUpdateContentPiece, useUpdatePieceStatus } from "@/hooks/useContent";

jest.mock("@/hooks/useContent", () => ({
  useUpdatePieceStatus: jest.fn(),
  useUpdateContentPiece: jest.fn(),
}));
jest.mock("sonner", () => ({
  toast: { error: jest.fn(), success: jest.fn(), warning: jest.fn() },
}));

const mockedStatusHook = jest.mocked(useUpdatePieceStatus);
const mockedPieceHook = jest.mocked(useUpdateContentPiece);

describe("content piece lifecycle actions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPieceHook.mockReturnValue({
      updatePiece: jest.fn(),
      isUpdating: false,
    });
  });

  test("archive awaits the persisted status and exposes a durable success result", async () => {
    const updateStatus = jest.fn().mockResolvedValue({
      id: "piece-1",
      project_id: "project-1",
      content_type: "linkedin",
      title: "Draft",
      body: "Body",
      status: "archived",
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-03T00:00:00.000Z",
    });
    mockedStatusHook.mockReturnValue({ updateStatus, isUpdating: false });
    const onStatusChanged = jest.fn();
    const onPieceChanged = jest.fn();
    const { result } = renderHook(() => usePieceActions({
      piece: {
        id: "piece-1",
        project_id: "project-1",
        content_type: "linkedin",
        title: "Draft",
        body: "Body",
        status: "draft",
        created_at: "2026-08-01T00:00:00.000Z",
        updated_at: "2026-08-02T00:00:00.000Z",
      },
      clientId: "client-1",
      body: "Body",
      persistedBody: "Body",
      currentUpdatedAt: "2026-08-02T00:00:00.000Z",
      dirty: false,
      adaptType: "facebook",
      editorRef: { current: null },
      setBody: jest.fn(),
      setPersistedBody: jest.fn(),
      setCurrentUpdatedAt: jest.fn(),
      setEditing: jest.fn(),
      setLearningSuggestion: jest.fn(),
      loadRevisions: jest.fn(),
      onPieceChanged,
      onStatusChanged,
      onArtifactCreated: jest.fn(),
    }));

    await act(async () => result.current.handleStatusChange("archived"));

    expect(updateStatus).toHaveBeenCalledWith(expect.objectContaining({
      id: "piece-1",
      status: "archived",
      expected_updated_at: "2026-08-02T00:00:00.000Z",
    }));
    expect(onStatusChanged).toHaveBeenCalledWith("piece-1", "archived");
    expect(onPieceChanged).toHaveBeenCalledWith(expect.objectContaining({ status: "archived" }));
    expect(result.current.lifecycleNotice).toEqual({
      kind: "success",
      message: "Content archived. It remains recoverable in the Library.",
    });
  });

  test("a failed archive always leaves a visible result", async () => {
    mockedStatusHook.mockReturnValue({
      updateStatus: jest.fn().mockRejectedValue(new Error("Content changed elsewhere.")),
      isUpdating: false,
    });
    const { result } = renderHook(() => usePieceActions({
      piece: {
        id: "piece-1",
        content_type: "linkedin",
        title: "Draft",
        body: "Body",
        status: "draft",
        created_at: "2026-08-01T00:00:00.000Z",
      },
      clientId: "client-1",
      body: "Body",
      persistedBody: "Body",
      currentUpdatedAt: "",
      dirty: false,
      adaptType: "facebook",
      editorRef: { current: null },
      setBody: jest.fn(),
      setPersistedBody: jest.fn(),
      setCurrentUpdatedAt: jest.fn(),
      setEditing: jest.fn(),
      setLearningSuggestion: jest.fn(),
      loadRevisions: jest.fn(),
      onPieceChanged: jest.fn(),
      onStatusChanged: jest.fn(),
      onArtifactCreated: jest.fn(),
    }));

    await act(async () => result.current.handleStatusChange("archived"));
    expect(result.current.lifecycleNotice).toEqual({
      kind: "error",
      message: "Status did not change: Content changed elsewhere.",
    });
    expect(toast.success).not.toHaveBeenCalled();
  });
});
