import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import MfaLink from "@/components/features/auth/MfaLink.vue";
import { isLoggedIn } from "@/scripts/authentication/authState";
import { clearSession, forgetLogin } from "@/scripts/authentication/user";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountWithRouter } from "@/__tests__/helpers/mount";

const WRONG_LINK =
  "The login link is wrong, expired or already used, or was opened in another browser: request a new one or log in again.";

let fetchMock: ReturnType<typeof mockFetch>;
let wrapper: VueWrapper | undefined;

const open = async (path: string) => {
  const mounted = await mountWithRouter(MfaLink, { attachTo: document.body }, path);
  wrapper = mounted.wrapper;
  return mounted;
};

describe("MfaLink", () => {
  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
    forgetLogin();
    clearSession();
  });
  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
  });

  it("drops the token from the address, sends it once and logs in", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { message: "Login successful with user me." }))
      .mockResolvedValueOnce(jsonResponse(200, { email: "me@example.com" }));
    const { router } = await open("/login/mfa#token=s3cret");
    expect(wrapper!.text()).toContain("Logging you in…");
    await flushPromises();

    expect(router.currentRoute.value.fullPath).toBe("/login/mfa");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({ token: "s3cret" });
    expect(isLoggedIn.value).toBe(true);
    const outcome = wrapper!.find(".link__outcome");
    expect(outcome.text()).toBe("Login successful!");
    expect(document.activeElement).toBe(outcome.element);
    expect(wrapper!.find("a").attributes("href")).toBe("/shorten");
  });

  it("says why a refused link didn't log in, with the way back to Log in", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: WRONG_LINK }));
    await open("/login/mfa#token=s3cret");
    await flushPromises();

    const outcome = wrapper!.find(".link__outcome");
    expect(outcome.text()).toBe(WRONG_LINK);
    expect(document.activeElement).toBe(outcome.element);
    expect(wrapper!.find("a").text()).toBe("Log in again");
    expect(wrapper!.find("a").attributes("href")).toBe("/login");
  });

  it("says so when the browser didn't keep the session", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { message: "Login successful with user me." }))
      .mockResolvedValueOnce(
        jsonResponse(403, { error: "You must be logged in to perform this action." })
      );
    await open("/login/mfa#token=s3cret");
    await flushPromises();

    expect(wrapper!.find(".link__outcome").text()).toMatch(/didn't keep the session/);
  });

  it("asks the API nothing for a link without a token", async () => {
    await open("/login/mfa");
    await flushPromises();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(wrapper!.find(".link__outcome").text()).toBe(
      "This login link isn't complete: open it again from the e-mail, or log in again."
    );
  });
});
