/**
 * useCrudDialog — shared save/archive/busy plumbing for the lead & expense edit
 * dialogs. Pins the contract: save runs onSubmit then closes + success-toasts;
 * a failed submit keeps the dialog open and does NOT toast (the api client owns
 * the error toast); canSave/archiveConfirm gate the actions.
 */
import { renderHook, act } from "@testing-library/react";
import { useCrudDialog } from "@/lib/hooks/useCrudDialog";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
import { toast } from "sonner";

const mockToast = toast as jest.Mocked<typeof toast>;

beforeEach(() => jest.clearAllMocks());

describe("useCrudDialog", () => {
  it("save: submits, success-toasts, then closes", async () => {
    const onClose = jest.fn();
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useCrudDialog({ mode: "create", onClose, onSubmit, messages: { created: "Added." } }),
    );

    await act(async () => { await result.current.save(); });

    expect(onSubmit).toHaveBeenCalled();
    expect(mockToast.success).toHaveBeenCalledWith("Added.");
    expect(onClose).toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
  });

  it("save: a failed submit keeps the dialog open and does not toast", async () => {
    const onClose = jest.fn();
    const onSubmit = jest.fn().mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() =>
      useCrudDialog({ mode: "edit", onClose, onSubmit, messages: { saved: "Saved." } }),
    );

    await act(async () => { await result.current.save(); });

    expect(onClose).not.toHaveBeenCalled();
    expect(mockToast.success).not.toHaveBeenCalled();
    // error toast is the api client's job, not the hook's.
    expect(mockToast.error).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
  });

  it("save: respects canSave", async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useCrudDialog({ mode: "create", onClose: jest.fn(), onSubmit, canSave: () => false }),
    );

    await act(async () => { await result.current.save(); });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("archive: skips when the confirm is declined", async () => {
    const onArchive = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useCrudDialog({
        mode: "edit", onClose: jest.fn(), onSubmit: jest.fn(),
        onArchive, archiveConfirm: () => "Sure?",
      }),
    );

    const spy = jest.spyOn(window, "confirm").mockReturnValue(false);
    await act(async () => { await result.current.archive(); });
    expect(onArchive).not.toHaveBeenCalled();
    spy.mockReturnValue(true);
    await act(async () => { await result.current.archive(); });
    expect(onArchive).toHaveBeenCalled();
    spy.mockRestore();
  });
});
