import { afterEach, describe, expect, it } from "vitest";
import { setNoindex } from "@/scripts/utility/robotsMeta";

const robotsTags = () => document.head.querySelectorAll('meta[name="robots"]');

describe("setNoindex", () => {
  afterEach(() => {
    robotsTags().forEach((tag) => tag.remove());
  });

  it("adds a robots noindex meta to the head", () => {
    setNoindex(true);

    expect(robotsTags()).toHaveLength(1);
    expect(robotsTags()[0].getAttribute("content")).toBe("noindex");
  });

  it("adds the tag only once, however often it's asked", () => {
    setNoindex(true);
    setNoindex(true);

    expect(robotsTags()).toHaveLength(1);
  });

  it("removes the tag again", () => {
    setNoindex(true);
    setNoindex(false);

    expect(robotsTags()).toHaveLength(0);
  });

  it("does nothing when there's no tag to remove", () => {
    setNoindex(false);

    expect(robotsTags()).toHaveLength(0);
  });

  it("leaves a robots tag the page already had alone", () => {
    const own = document.createElement("meta");
    own.name = "robots";
    own.content = "nofollow";
    document.head.append(own);

    setNoindex(true);
    expect(robotsTags()).toHaveLength(2);

    setNoindex(false);
    expect([...robotsTags()]).toEqual([own]);
    expect(own.content).toBe("nofollow");
  });
});
