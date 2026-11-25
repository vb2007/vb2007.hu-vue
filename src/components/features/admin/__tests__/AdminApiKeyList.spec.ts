import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import AdminApiKeyList from "@/components/features/admin/AdminApiKeyList.vue";
import { formatDate } from "@/scripts/utility/dateUtil";
import type { ApiKey } from "@/types/api/apiKeys";
import { anApiKey } from "@/__tests__/helpers/admin";

const mountList = (keys: ApiKey[]) => mount(AdminApiKeyList, { props: { keys, username: "anna" } });

describe("AdminApiKeyList", () => {
  it("lists each key's name, token end, scopes and dates, read-only", () => {
    const key = anApiKey("k1", {
      name: "Deploy bot",
      scopes: ["pastes:read", "pastes:write", "uploads:read"],
      lastUsedAt: "2026-11-22T08:00:00.000Z"
    });
    const wrapper = mountList([key]);

    expect(wrapper.find("ul").attributes("aria-label")).toBe("anna's API keys");
    const row = wrapper.find("li");
    expect(row.find("h3").text()).toBe("Deploy bot ending in …x9Qk");
    expect(row.find(".key__hint [aria-hidden=true]").text()).toBe("…");
    expect(row.find(".key__scopes").text()).toBe("pastes:read, pastes:write, uploads:read");
    // Dots for the eye, commas for screen readers.
    expect(row.find(".key__dates").text()).toBe(
      `Created ${formatDate(key.createdAt)},  ·\u00a0Expires ${formatDate(key.expiresAt!)},  ·\u00a0Last used ${formatDate(key.lastUsedAt!)}`
    );
    expect(row.find(".key__expired").exists()).toBe(false);
    expect(wrapper.find("button").exists()).toBe(false);
  });

  it("says when a key never expires or was never used, and stresses one that expired", () => {
    const wrapper = mountList([
      anApiKey("k1", { expiresAt: null }),
      anApiKey("k2", { expiresAt: "2001-01-01T00:00:00.000Z" })
    ]);
    const [forever, expired] = wrapper.findAll(".key__dates");

    expect(forever.text()).toMatch(/,  ·\u00a0Never expires,  ·\u00a0Never used$/);
    expect(expired.find(".key__expired").text()).toBe(
      `Expired ${formatDate("2001-01-01T00:00:00.000Z")}`
    );
  });

  it("says when the account has none", () => {
    const wrapper = mountList([]);

    expect(wrapper.find("ul").exists()).toBe(false);
    expect(wrapper.find(".none").text()).toBe("anna has no API keys.");
  });
});
