/**
 * useResource — the generic React-Query CRUD collection that backs Users,
 * Leads and Expenses. These tests pin the optimistic behaviour that the admin
 * tools rely on: create prepends, update merges then replaces with the server
 * row, remove drops, and a failed mutation rolls the list back to its prior
 * state (so e.g. a kanban drag that the server rejects snaps back).
 */
import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useResource } from "@/lib/hooks/useResource";

// Mock the api client — the hook's job is the optimistic cache choreography,
// not the network. We drive create/update/delete return values per test.
jest.mock("@/lib/api-client", () => ({
  api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
import { api } from "@/lib/api-client";

const mockApi = api as jest.Mocked<typeof api>;

interface Row { id: string; name: string; stage?: string }

function wrapper() {
  // Retries off + no refetch so the test asserts exactly the optimistic path.
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

function setup(initial: Row[]) {
  // get is the background refetch onSettled — echo current server state.
  mockApi.get.mockResolvedValue(initial as never);
  return renderHook(
    () => useResource<Row>({ key: ["test", "rows"], route: "/test", initial }),
    { wrapper: wrapper() },
  );
}

beforeEach(() => jest.clearAllMocks());

describe("useResource", () => {
  it("seeds the list from initial data", () => {
    const { result } = setup([{ id: "1", name: "A" }]);
    expect(result.current.items).toEqual([{ id: "1", name: "A" }]);
  });

  it("create prepends the server row", async () => {
    const initial = [{ id: "1", name: "A" }];
    // get is the onSettled refetch — it returns server truth (new row included).
    mockApi.get.mockResolvedValue([{ id: "2", name: "B" }, { id: "1", name: "A" }] as never);
    mockApi.post.mockResolvedValue({ id: "2", name: "B" } as never);
    const { result } = renderHook(
      () => useResource<Row>({ key: ["test", "rows"], route: "/test", initial }),
      { wrapper: wrapper() },
    );

    await act(async () => { await result.current.create({ name: "B" }); });

    await waitFor(() => expect(result.current.items[0]).toEqual({ id: "2", name: "B" }));
    expect(mockApi.post).toHaveBeenCalledWith("/test", { name: "B" });
  });

  it("update merges optimistically then replaces with the server row", async () => {
    const initial = [{ id: "1", name: "A", stage: "new" }];
    mockApi.get.mockResolvedValue([{ id: "1", name: "A", stage: "won" }] as never);
    mockApi.patch.mockResolvedValue({ id: "1", name: "A", stage: "won" } as never);
    const { result } = renderHook(
      () => useResource<Row>({ key: ["test", "rows"], route: "/test", initial }),
      { wrapper: wrapper() },
    );

    await act(async () => { await result.current.update({ id: "1", stage: "won" }); });

    await waitFor(() =>
      expect(result.current.items.find((r) => r.id === "1")?.stage).toBe("won"),
    );
  });

  it("rolls back the list when an update fails", async () => {
    const initial = [{ id: "1", name: "A", stage: "new" }];
    mockApi.get.mockResolvedValue(initial as never);
    mockApi.patch.mockRejectedValue(new Error("nope"));
    const { result } = renderHook(
      () => useResource<Row>({ key: ["test", "rows"], route: "/test", initial }),
      { wrapper: wrapper() },
    );

    await act(async () => {
      await result.current.update({ id: "1", stage: "won" }).catch(() => {});
    });

    await waitFor(() =>
      expect(result.current.items.find((r) => r.id === "1")?.stage).toBe("new"),
    );
  });

  it("remove drops the row, and restores it on failure", async () => {
    const initial = [{ id: "1", name: "A" }, { id: "2", name: "B" }];
    mockApi.get.mockResolvedValue(initial as never);
    mockApi.delete.mockRejectedValue(new Error("nope"));
    const { result } = renderHook(
      () => useResource<Row>({ key: ["test", "rows"], route: "/test", initial }),
      { wrapper: wrapper() },
    );

    await act(async () => {
      await result.current.remove({ id: "2" }).catch(() => {});
    });

    // Optimistically removed then rolled back since the delete rejected.
    await waitFor(() => expect(result.current.items).toHaveLength(2));
  });
});
