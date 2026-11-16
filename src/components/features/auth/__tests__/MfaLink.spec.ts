import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import MfaLink from "@/components/features/auth/MfaLink.vue";
import { isLoggedIn } from "@/scripts/authentication/authState";
import { clearSession, forgetLogin } from "@/scripts/authentication/user";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountWithRouter } from "@/__tests__/helpers/mount";

const WRONG_LINK =
  "The login link is wrong, expired or already used, or was opened in another browser: request a new one or log in again.";

const EXPIRED =
  "The login's second step expired, used up its tries or was never started: log in again.";
const LOGGED_OUT = () =>
  jsonResponse(403, { error: "You must be logged in to perform this action." });

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

  it("drops the token from the address before sending it once, and logs in", async () => {
    let pathWhenSent = "";
    fetchMock
      .mockResolvedValueOnce(LOGGED_OUT())
      .mockImplementationOnce(async () => {
        pathWhenSent = router.currentRoute.value.fullPath;
        return jsonResponse(200, { message: "Login successful with user me." });
      })
      .mockResolvedValueOnce(jsonResponse(200, { email: "me@example.com" }));
    const { router } = await open("/login/mfa#token=s3cret");
    expect(wrapper!.text()).toContain("Logging you in…");
    await flushPromises();

    expect(pathWhenSent).toBe("/login/mfa");
    expect(router.currentRoute.value.fullPath).toBe("/login/mfa");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchMock.mock.calls[1][1]!.body as string)).toEqual({ token: "s3cret" });
    expect(isLoggedIn.value).toBe(true);
    const outcome = wrapper!.find(".link__outcome");
    expect(outcome.text()).toBe("Login successful!");
    expect(document.activeElement).toBe(outcome.element);
    expect(wrapper!.find("a").attributes("href")).toBe("/shorten");
  });

  it("says why a refused link didn't log in, with the way back to Log in", async () => {
    fetchMock
      .mockResolvedValueOnce(LOGGED_OUT())
      .mockResolvedValueOnce(jsonResponse(400, { error: WRONG_LINK }));
    await open("/login/mfa#token=s3cret");
    await flushPromises();

    const outcome = wrapper!.find(".link__outcome");
    expect(outcome.text()).toBe(WRONG_LINK);
    expect(document.activeElement).toBe(outcome.element);
    expect(wrapper!.find("a").text()).toBe("Log in again");
    expect(wrapper!.find("a").attributes("href")).toBe("/login");
  });

  it("adds the step's tries left to a wrong link's refusal", async () => {
    fetchMock
      .mockResolvedValueOnce(LOGGED_OUT())
      .mockResolvedValueOnce(jsonResponse(400, { error: WRONG_LINK, attemptsLeft: 3 }));
    await open("/login/mfa#token=s3cret");
    await flushPromises();

    expect(wrapper!.find(".link__outcome").text()).toBe(`${WRONG_LINK} 3 tries left.`);
  });

  it("says a wrong last link ended the login", async () => {
    fetchMock
      .mockResolvedValueOnce(LOGGED_OUT())
      .mockResolvedValueOnce(jsonResponse(400, { error: WRONG_LINK, attemptsLeft: 0 }))
      .mockResolvedValueOnce(LOGGED_OUT());
    await open("/login/mfa#token=s3cret");
    await flushPromises();

    expect(wrapper!.find(".link__outcome").text()).toBe(
      "Too many wrong answers: this login used up its 5 tries. Log in again."
    );
  });

  it("points a link opened in another browser to the one that logged in", async () => {
    fetchMock
      .mockResolvedValueOnce(LOGGED_OUT())
      .mockResolvedValueOnce(jsonResponse(403, { error: EXPIRED, reason: "noChallenge" }))
      .mockResolvedValueOnce(LOGGED_OUT());
    await open("/login/mfa#token=s3cret");
    await flushPromises();

    expect(wrapper!.find(".link__outcome").text()).toBe(
      "This browser has no login waiting for a second step. Open the e-mail's link in the browser where you entered your password, or log in again."
    );
    expect(wrapper!.find("a").text()).toBe("Log in again");
  });

  it("says this browser is logged in already, without sending a link opened again", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { email: "me@example.com" }));
    await open("/login/mfa#token=s3cret");
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(wrapper!.find(".link__outcome").text()).toBe("You're already logged in.");
    expect(wrapper!.find("a").attributes("href")).toBe("/shorten");
  });

  it("takes the login on when the step was passed in another tab meanwhile", async () => {
    fetchMock
      .mockResolvedValueOnce(LOGGED_OUT())
      .mockResolvedValueOnce(jsonResponse(403, { error: EXPIRED }))
      .mockResolvedValueOnce(jsonResponse(200, { email: "me@example.com" }));
    await open("/login/mfa#token=s3cret");
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(wrapper!.find(".link__outcome").text()).toBe("Login successful!");
  });

  it("says the step expired, with the way back, when nothing logged this browser in", async () => {
    fetchMock
      .mockResolvedValueOnce(LOGGED_OUT())
      .mockResolvedValueOnce(jsonResponse(403, { error: EXPIRED }))
      .mockResolvedValueOnce(LOGGED_OUT());
    await open("/login/mfa#token=s3cret");
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(wrapper!.find(".link__outcome").text()).toBe(EXPIRED);
    expect(wrapper!.find("a").text()).toBe("Log in again");
  });

  it("says so when the browser didn't keep the session", async () => {
    fetchMock
      .mockResolvedValueOnce(LOGGED_OUT())
      .mockResolvedValueOnce(jsonResponse(200, { message: "Login successful with user me." }))
      .mockResolvedValueOnce(LOGGED_OUT());
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
