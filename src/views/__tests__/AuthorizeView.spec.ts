import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import AuthorizeView from "@/views/AuthorizeView.vue";
import { Messages } from "@/constants/messages";
import {
  isLoggedIn,
  isSessionChecked,
  sessionEnded,
  userEmail,
  userId,
  username
} from "@/scripts/authentication/authState";
import { takeGithubReturn } from "@/scripts/authentication/githubReturn";
import {
  fetchUserDetails,
  loginStatus,
  logout,
  restoreSession
} from "@/scripts/authentication/user";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountWithRouter } from "@/__tests__/helpers/mount";

vi.mock("@/scripts/authentication/user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/scripts/authentication/user")>()),
  fetchUserDetails: vi.fn(),
  logout: vi.fn(),
  restoreSession: vi.fn()
}));

const PARAMS = {
  response_type: "code",
  client_id: "spotdl",
  redirect_uri: "https://spotdl.example/login/callback",
  state: "af0ifjsldkj",
  code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  code_challenge_method: "S256",
  nonce: "n-0S6_WzA2Mj"
};
const PATH = `/authorize?${new URLSearchParams(PARAMS)}`;
const CLIENT = { id: "spotdl", name: "spotdl-web", scopes: [] };
const APPROVED = `${PARAMS.redirect_uri}?code=abc&state=${PARAMS.state}`;

describe("AuthorizeView", () => {
  let fetchMock: ReturnType<typeof mockFetch>;
  const assign = vi.fn();

  /** The page at `path`, its client answered, attached so focus can be checked. */
  const open = async (path = PATH) => {
    if (path === PATH) fetchMock.mockResolvedValueOnce(jsonResponse(200, CLIENT));
    const { wrapper } = await mountWithRouter(AuthorizeView, { attachTo: document.body }, path);
    await flushPromises();
    return wrapper;
  };

  const loggedIn = (name = "anna") => {
    isSessionChecked.value = true;
    isLoggedIn.value = true;
    username.value = name;
    userEmail.value = "anna@example.com";
    userId.value = `id-${name}`;
  };

  const key = (wrapper: Awaited<ReturnType<typeof open>>, label: RegExp) =>
    wrapper.findAll("button").find((button) => label.test(button.text()))!;

  beforeEach(() => {
    fetchMock = mockFetch();
    assign.mockReset();
    vi.stubGlobal("location", { ...window.location, assign });
    vi.mocked(logout).mockReset();
    vi.mocked(restoreSession).mockReset();
    // The session is as the test arranged it.
    vi.mocked(fetchUserDetails).mockReset().mockResolvedValue(true);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
    loginStatus.value = "";
  });

  it("waits for the app and the session, looking the session up", async () => {
    const wrapper = await open();

    expect(restoreSession).toHaveBeenCalledOnce();
    expect(wrapper.find("[role=status]").text()).toBe("Loading the sign-in…");
    expect(wrapper.find("h1").text()).toBe("Sign in");
  });

  it("asks as the account logged in, and goes back to the app on Continue", async () => {
    loggedIn();
    const wrapper = await open();

    expect(wrapper.find(".lead").text()).toBe(
      "spotdl-web wants you to sign in with your vb2007.hu account."
    );
    expect(wrapper.find(".account__name").text()).toBe("anna");
    expect(wrapper.find(".account__email").text()).toBe("anna@example.com");
    expect(wrapper.find(".note").text()).toBe(Messages.OAuth.consentNote("spotdl-web"));

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { redirectTo: APPROVED }));
    await key(wrapper, /^Continue$/).trigger("click");
    expect(key(wrapper, /^Signing in$/).attributes("aria-busy")).toBe("true");
    expect(key(wrapper, /^Cancel$/).attributes("disabled")).toBeDefined();
    await flushPromises();

    expect(assign).toHaveBeenCalledWith(APPROVED);
  });

  it("names an account without a username by its address", async () => {
    loggedIn("");
    const wrapper = await open();

    expect(wrapper.find(".account__name").text()).toBe("anna@example.com");
    expect(wrapper.find(".account__email").exists()).toBe(false);
  });

  it("cancels with the API's access_denied answer", async () => {
    loggedIn();
    const wrapper = await open();
    const denied = `${PARAMS.redirect_uri}?error=access_denied&state=${PARAMS.state}`;
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { redirectTo: denied }));

    await key(wrapper, /^Cancel$/).trigger("click");
    expect(key(wrapper, /^Cancelling$/).exists()).toBe(true);
    await flushPromises();

    expect(JSON.parse(fetchMock.mock.lastCall![1]!.body as string).approve).toBe(false);
    expect(assign).toHaveBeenCalledWith(denied);
  });

  it("holds both keys at the 429, focusing its message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    loggedIn();
    const wrapper = await open();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(429, { error: "Too many authorization requests.", retryAfter: 42 })
    );

    await key(wrapper, /^Continue$/).trigger("click");
    await flushPromises();

    const message = wrapper.find(".outcome");
    expect(message.text()).toContain(Messages.OAuth.tooManyRequests);
    expect(document.activeElement).toBe(message.element);
    const held = key(wrapper, /^Try again in 42 sec$/);
    expect(held.attributes("disabled")).toBeDefined();
    expect(held.attributes("aria-label")).toBe("Try again in 42 seconds");
    expect(held.attributes("aria-describedby")).toBeDefined();
    expect(key(wrapper, /^Cancel$/).attributes("disabled")).toBeDefined();
    expect(assign).not.toHaveBeenCalled();
  });

  it("ends at the API's 400 with the site's own message, focused", async () => {
    loggedIn();
    const wrapper = await open();
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: "Send response_type=code, …" }));

    await key(wrapper, /^Continue$/).trigger("click");
    await flushPromises();

    expect(wrapper.find(".outcome").text()).toBe(Messages.OAuth.invalidRequest);
    expect(document.activeElement).toBe(wrapper.find(".outcome").element);
    expect(wrapper.find("a").text()).toBe("Back to home");
    expect(key(wrapper, /^Continue$/)).toBeUndefined();
  });

  it("says why a request can't go on, focused, without asking anything", async () => {
    loggedIn();
    const wrapper = await open("/authorize?error=invalid_redirect_uri");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(wrapper.find(".outcome").text()).toBe(Messages.OAuth.invalidRedirectUri);
    expect(document.activeElement).toBe(wrapper.find(".outcome").element);
  });

  it("logs out for another account, then focuses the login's address", async () => {
    loggedIn();
    vi.mocked(logout).mockImplementationOnce(async () => {
      isLoggedIn.value = false;
    });
    const wrapper = await open();

    await key(wrapper, /^Use another account$/).trigger("click");
    await flushPromises();

    expect(logout).toHaveBeenCalledOnce();
    expect(wrapper.find(".status").text()).toBe(Messages.OAuth.loginLead("spotdl-web"));
    expect(document.activeElement).toBe(wrapper.find("input[type=email]").element);
  });

  it("logs in on the page, then asks with the question focused", async () => {
    isSessionChecked.value = true;
    const wrapper = await open();
    expect(wrapper.find("h1").text()).toBe("Log in");
    expect(wrapper.find(".status").text()).toBe(Messages.OAuth.loginLead("spotdl-web"));

    // A GitHub login comes back here (jsdom can't follow the link itself).
    const github = wrapper.find("a[href$='/auth/github']");
    github.element.addEventListener("click", (event) => event.preventDefault());
    await github.trigger("click");
    expect(takeGithubReturn()).toBe(PATH);

    loggedIn();
    await flushPromises();

    expect(document.activeElement).toBe(wrapper.find(".lead").element);
  });

  it("says the session ended when the API turned it away meanwhile", async () => {
    isSessionChecked.value = true;
    sessionEnded.value = true;
    const wrapper = await open();

    expect(wrapper.find(".status").text()).toBe(Messages.OAuth.sessionEnded("spotdl-web"));
  });

  it("puts the cursor in the login when the answer found the session ended", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    loggedIn();
    const wrapper = await open();
    fetchMock.mockImplementationOnce(async () => {
      // What the session check of the logged-out 403 does.
      isLoggedIn.value = false;
      sessionEnded.value = true;
      return jsonResponse(403, { error: Messages.Auth.notLoggedIn });
    });

    await key(wrapper, /^Continue$/).trigger("click");
    await flushPromises();

    expect(wrapper.find(".status").text()).toBe(Messages.OAuth.sessionEnded("spotdl-web"));
    expect(document.activeElement).toBe(wrapper.find("input[type=email]").element);
    expect(assign).not.toHaveBeenCalled();
  });

  it("asks again as the account another tab logged in, without answering", async () => {
    loggedIn();
    const wrapper = await open();
    vi.mocked(fetchUserDetails).mockImplementationOnce(async () => {
      loggedIn("bob");
      return true;
    });

    await key(wrapper, /^Continue$/).trigger("click");
    await flushPromises();

    expect(wrapper.find(".account__name").text()).toBe("bob");
    expect(wrapper.find(".outcome").text()).toBe(Messages.OAuth.accountChanged);
    expect(document.activeElement).toBe(wrapper.find(".outcome").element);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(key(wrapper, /^Continue$/).attributes("disabled")).toBeUndefined();
  });

  it("drops the session-ended note once a new login has its answer", async () => {
    isSessionChecked.value = true;
    sessionEnded.value = true;
    const wrapper = await open();

    const note = () => wrapper.findAll(".status")[0].text();

    loginStatus.value = "This account is suspended.";
    await flushPromises();
    expect(note()).toBe(Messages.OAuth.loginLead("spotdl-web"));

    // The next try empties the status while it's out: the note stays as it is.
    loginStatus.value = "";
    await flushPromises();
    expect(note()).toBe(Messages.OAuth.loginLead("spotdl-web"));
  });

  it("brings the session-ended note back only when a session ends again", async () => {
    isSessionChecked.value = true;
    sessionEnded.value = true;
    const wrapper = await open();
    const note = () => wrapper.findAll(".status")[0].text();
    loginStatus.value = "This account is suspended.";
    await flushPromises();

    // Logged in, then out again here: no session was turned away.
    sessionEnded.value = false;
    await flushPromises();
    expect(note()).toBe(Messages.OAuth.loginLead("spotdl-web"));

    sessionEnded.value = true;
    await flushPromises();
    expect(note()).toBe(Messages.OAuth.sessionEnded("spotdl-web"));
  });
});
