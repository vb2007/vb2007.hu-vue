import { describe, expect, it } from "vitest";
import { effectScope } from "vue";
import { useLatestRequest } from "@/composables/useLatestRequest";

describe("useLatestRequest", () => {
  it("aborts the previous request when the next one starts", () => {
    const latest = useLatestRequest();

    const first = latest.next();
    expect(first.aborted).toBe(false);
    const second = latest.next();

    expect(first.aborted).toBe(true);
    expect(second.aborted).toBe(false);
  });

  it("aborts the one in flight when its scope goes away", () => {
    const scope = effectScope();
    const latest = scope.run(() => useLatestRequest())!;
    const signal = latest.next();

    scope.stop();

    expect(signal.aborted).toBe(true);
  });

  it("has nothing to abort when its scope goes away before any request", () => {
    const scope = effectScope();
    scope.run(() => useLatestRequest());

    expect(() => scope.stop()).not.toThrow();
  });
});
