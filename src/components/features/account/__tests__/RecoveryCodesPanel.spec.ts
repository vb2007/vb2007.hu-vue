import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import RecoveryCodesPanel from "@/components/features/account/RecoveryCodesPanel.vue";
import { username } from "@/scripts/authentication/authState";

const CODES = Array.from({ length: 10 }, (_, i) => `abcd${i}-efgh${i}`);

let wrapper: VueWrapper | undefined;
let made: Blob[];

/** jsdom's Blob has no `text()`. */
const readText = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsText(blob);
  });

describe("RecoveryCodesPanel", () => {
  beforeEach(() => {
    made = [];
    let count = 0;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      made.push(blob);
      return `blob:codes-${++count}`;
    });
    URL.revokeObjectURL = vi.fn();
    username.value = "vb";
  });
  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    vi.unstubAllGlobals();
  });

  it("lists the codes in monospace with its heading focused", () => {
    wrapper = mount(RecoveryCodesPanel, { props: { codes: CODES }, attachTo: document.body });

    expect(wrapper.findAll(".codes__code").map((code) => code.text())).toEqual(CODES);
    expect(wrapper.find("ol").attributes("aria-label")).toBe("10 recovery codes");
    expect(document.activeElement).toBe(wrapper.find("#codes-title").element);
    expect(wrapper.text()).toContain("they're shown only now");
  });

  it("downloads them as a text file, freed once the panel goes", async () => {
    wrapper = mount(RecoveryCodesPanel, { props: { codes: CODES } });

    const download = wrapper.find("a");
    expect(download.attributes("href")).toBe("blob:codes-1");
    expect(download.attributes("download")).toBe("vb2007.hu-recovery-codes.txt");
    const text = await readText(made[0]);
    expect(text).toContain("vb2007.hu recovery codes for vb");
    expect(text).toContain(CODES.join("\n"));

    await wrapper.setProps({ codes: CODES.slice().reverse() });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:codes-1");
    expect(wrapper.find("a").attributes("href")).toBe("blob:codes-2");

    wrapper.unmount();
    wrapper = undefined;
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:codes-2");
  });

  it("copies them, one a line, and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    wrapper = mount(RecoveryCodesPanel, { props: { codes: CODES } });

    await wrapper.find("button").trigger("click");
    await flushPromises();

    expect(writeText).toHaveBeenCalledWith(CODES.join("\n"));
    expect(wrapper.find("button").text()).toBe("Copied");
    expect(wrapper.find('[role="status"]').text()).toBe("Codes copied.");
  });

  it("says when copying failed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error()) }
    });
    wrapper = mount(RecoveryCodesPanel, { props: { codes: CODES } });

    await wrapper.find("button").trigger("click");
    await flushPromises();

    expect(wrapper.find('[role="status"]').text()).toBe("Couldn't copy: select the codes instead.");
  });

  it("closes only once the user says they're saved", async () => {
    wrapper = mount(RecoveryCodesPanel, { props: { codes: CODES } });

    await wrapper.findAll("button").at(-1)!.trigger("click");

    expect(wrapper.emitted("done")).toHaveLength(1);
  });
});
