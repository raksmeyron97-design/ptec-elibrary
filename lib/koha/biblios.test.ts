import { describe, it, expect } from "vitest";
import { findKohaBiblioIdsByIsbn } from "./biblios";
import { createKohaClient } from "./client";
import { resolveKohaConfig } from "./config";
import { createMockKoha } from "./mock";

const mockClient = (mock = createMockKoha()) =>
  ({ client: createKohaClient(resolveKohaConfig({ KOHA_INTEGRATION: "mock" }), { fetch: mock.fetch }), mock });

describe("findKohaBiblioIdsByIsbn", () => {
  it("finds a record by either ISBN form, with the query Koha's -like filter expects", async () => {
    const { client, mock } = mockClient();
    expect(await findKohaBiblioIdsByIsbn(client, "9780000000002", "0000000000")).toEqual([
      { biblio_id: 1, title: "Mock Koha record", author: "PTEC Test", isbn: "9780000000002 | 0000000000" },
    ]);
    const call = mock.calls.find((c) => c.path.startsWith("/api/v1/biblios"))!;
    const q = JSON.parse(new URL(`http://x${call.path}`).searchParams.get("q")!);
    expect(q).toEqual({ "-or": [{ isbn: { "-like": "%9780000000002%" } }, { isbn: { "-like": "%0000000000%" } }] });
  });

  it("an ISBN Koha does not hold is an empty list", async () => {
    const { client } = mockClient();
    expect(await findKohaBiblioIdsByIsbn(client, "9780134685991", "0134685997")).toEqual([]);
  });
});
