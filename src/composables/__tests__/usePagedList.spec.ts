import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { SEARCH_DELAY_MS, usePagedList, type ListSort } from "@/composables/usePagedList";
import type { ApiResult } from "@/scripts/api/client";
import type { BasePagination, Pagination } from "@/types/api/common";
import { mountComposable } from "@/__tests__/helpers/host";

type Row = { id: string };
type Sorted = { rows: Row[]; pagination: Pagination<"name" | "size">; owner?: string };
type Unsorted = { rows: Row[]; pagination: BasePagination };

const rows = (...ids: string[]) => ids.map((id) => ({ id }));
const counts = (total: number, page = 1, pages = Math.ceil(total / 2)) => ({
  limit: 2,
  page,
  total,
  pages
});
const ok = <Data>(data: Data): ApiResult<Data> => ({ ok: true, status: 200, data });

/** A list route answered by hand, with every query it was sent. */
const route = <Data>() => {
  const answers: ((value: ApiResult<Data>) => void)[] = [];
  const fetch = vi.fn<(query: object, signal: AbortSignal) => Promise<ApiResult<Data>>>(
    () => new Promise((resolve) => answers.push(resolve))
  );
  const answer = async (result: ApiResult<Data>, index = answers.length - 1) => {
    answers[index](result);
    await nextTick();
  };
  return { fetch, answer, lastQuery: () => fetch.mock.calls.at(-1)![0] };
};

const NAME_SORT: ListSort<"name" | "size"> = { by: "name", order: "asc" };

describe("usePagedList", () => {
  beforeEach(() => vi.useRealTimers());

  it("loads a page of a list without a sort, sending only the limit and the page", async () => {
    const { fetch, answer } = route<Unsorted>();
    const { api } = mountComposable(() =>
      usePagedList({ limit: 2, fetch, items: (data) => data.rows })
    );

    const loading = api.load();
    expect(api.isLoading.value).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      { limit: 2, page: 1, q: undefined },
      expect.any(AbortSignal)
    );
    expect("setSort" in api).toBe(false);
    await answer(ok({ rows: rows("a", "b"), pagination: counts(3) }));
    await loading;

    expect(api.items.value).toEqual(rows("a", "b"));
    expect(api.pagination.value).toEqual(counts(3));
    expect(api.isLoading.value).toBe(false);
  });

  it("sends the sort, then the filters, then the search, and sorting goes back to page 1", async () => {
    const { fetch, answer, lastQuery } = route<Sorted>();
    const onLoad = vi.fn();
    let kind: string | undefined = "image";
    const { api } = mountComposable(() =>
      usePagedList({
        limit: 2,
        sort: NAME_SORT,
        filters: () => ({ kind }),
        fetch,
        items: (data) => data.rows,
        onLoad
      })
    );

    const going = api.goToPage(3);
    expect(Object.entries(lastQuery())).toEqual([
      ["limit", 2],
      ["page", 3],
      ["sortBy", "name"],
      ["sortOrder", "asc"],
      ["kind", "image"],
      ["q", undefined]
    ]);
    const data = {
      rows: rows("e"),
      pagination: { ...counts(5, 3), sortBy: "name" as const, sortOrder: "asc" as const },
      owner: "anna"
    };
    await answer(ok(data));
    await going;
    expect(onLoad).toHaveBeenCalledWith(data);

    kind = undefined;
    const sorting = api.setSort("size", "desc");
    expect(api.page.value).toBe(1);
    expect(api.sortBy.value).toBe("size");
    expect(api.sortOrder.value).toBe("desc");
    expect(lastQuery()).toEqual({
      limit: 2,
      page: 1,
      sortBy: "size",
      sortOrder: "desc",
      kind: undefined,
      q: undefined
    });
    await answer(ok(data));
    await sorting;
  });

  it("searches once typing pauses, trimmed, and not again for a search it already shows", async () => {
    vi.useFakeTimers();
    const { fetch, lastQuery } = route<Unsorted>();
    const { api } = mountComposable(() =>
      usePagedList({ limit: 2, fetch, items: (data) => data.rows })
    );
    api.page.value = 4;

    api.query.value = " ann";
    await nextTick();
    api.query.value = " anna ";
    await nextTick();
    vi.advanceTimersByTime(SEARCH_DELAY_MS - 1);
    expect(fetch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(lastQuery()).toEqual({ limit: 2, page: 1, q: "anna" });

    api.query.value = "anna  ";
    await nextTick();
    vi.advanceTimersByTime(SEARCH_DELAY_MS);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("drops a pending search when it goes away", async () => {
    vi.useFakeTimers();
    const { fetch } = route<Unsorted>();
    const { api, wrapper } = mountComposable(() =>
      usePagedList({ limit: 2, fetch, items: (data) => data.rows })
    );

    api.query.value = "anna";
    await nextTick();
    wrapper.unmount();
    vi.runAllTimers();

    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps the rows and shows the error when a load fails", async () => {
    const { fetch, answer } = route<Unsorted>();
    const { api } = mountComposable(() =>
      usePagedList({ limit: 2, fetch, items: (data) => data.rows })
    );
    let loading = api.load();
    await answer(ok({ rows: rows("a"), pagination: counts(1) }));
    await loading;

    loading = api.load();
    await answer({ ok: false, kind: "http", status: 500, error: "It broke.", body: null });
    await loading;

    expect(api.errorMessage.value).toBe("It broke.");
    expect(api.items.value).toEqual(rows("a"));
    expect(api.isLoading.value).toBe(false);
  });

  it("aborts a load that a newer one replaces, and ignores its late answer", async () => {
    const { fetch, answer } = route<Unsorted>();
    const { api } = mountComposable(() =>
      usePagedList({ limit: 2, fetch, items: (data) => data.rows })
    );

    const older = api.load();
    const newer = api.goToPage(2);
    expect(fetch.mock.calls[0][1].aborted).toBe(true);
    expect(fetch.mock.calls[1][1].aborted).toBe(false);

    await answer(ok({ rows: rows("c"), pagination: counts(3, 2) }), 1);
    await newer;
    await answer(ok({ rows: rows("a", "b"), pagination: counts(3) }), 0);
    await older;

    expect(api.items.value).toEqual(rows("c"));
    expect(api.pagination.value).toEqual(counts(3, 2));
    expect(api.isLoading.value).toBe(false);
  });

  it("steps back a page after the last row on a later page is deleted", async () => {
    const { fetch, answer, lastQuery } = route<Unsorted>();
    const { api } = mountComposable(() =>
      usePagedList({ limit: 2, fetch, items: (data) => data.rows })
    );
    const show = async (page: number, ...ids: string[]) => {
      const loading = api.goToPage(page);
      await answer(ok({ rows: rows(...ids), pagination: counts(2 * page - 2 + ids.length, page) }));
      await loading;
    };

    // Two rows left: the page still has one after the delete.
    await show(2, "c", "d");
    let reloading = api.reloadAfterRemove();
    expect(lastQuery()).toMatchObject({ page: 2 });
    await answer(ok({ rows: rows("c"), pagination: counts(3, 2) }));
    await reloading;

    // The last row on page 2: back to page 1.
    reloading = api.reloadAfterRemove();
    expect(api.page.value).toBe(1);
    expect(lastQuery()).toMatchObject({ page: 1 });
    await answer(ok({ rows: rows("a", "b"), pagination: counts(2) }));
    await reloading;

    // The last row on page 1 stays on page 1.
    await show(1, "a");
    reloading = api.reloadAfterRemove();
    expect(lastQuery()).toMatchObject({ page: 1 });
    await answer(ok({ rows: [], pagination: counts(0, 1, 0) }));
    await reloading;
    expect(api.items.value).toEqual([]);
  });
});
