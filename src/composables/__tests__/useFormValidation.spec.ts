import { describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { useFormValidation } from "@/composables/useFormValidation";

const setup = () => {
  const name = ref("");
  const confirm = ref("");
  const form = useFormValidation({
    name: {
      value: name,
      check: () => (name.value.length >= 3 ? "" : "Too short."),
      early: () => (name.value.includes("/") ? "No slashes." : "")
    },
    confirm: { value: confirm, check: () => (confirm.value === name.value ? "" : "No match.") }
  });
  return { name, confirm, ...form };
};

describe("useFormValidation", () => {
  it("shows nothing at first, but the form isn't valid yet", () => {
    const { errors, isValid } = setup();

    expect(errors.value).toEqual({ name: "", confirm: "" });
    expect(isValid.value).toBe(false);
  });

  it("shows a problem once the edited field is left, then follows every change", async () => {
    const { name, errors, leave } = setup();

    name.value = "ab";
    expect(errors.value.name).toBe("");

    leave("name");
    expect(errors.value.name).toBe("Too short.");

    name.value = "abc";
    await nextTick();
    expect(errors.value.name).toBe("");

    name.value = "a";
    expect(errors.value.name).toBe("Too short.");
  });

  it("waits for a click that moved focus to land before showing the problem", () => {
    vi.useFakeTimers();
    const { name, errors, leave } = setup();
    name.value = "ab";

    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    leave("name");
    expect(errors.value.name).toBe("");

    document.body.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(errors.value.name).toBe("");
    vi.runAllTimers();
    expect(errors.value.name).toBe("Too short.");
    vi.useRealTimers();
  });

  it("stays quiet when a field is only passed through", () => {
    const { errors, leave } = setup();

    leave("name");

    expect(errors.value.name).toBe("");
  });

  it("shows early problems while typing", () => {
    const { name, errors } = setup();

    name.value = "a/";

    expect(errors.value.name).toBe("No slashes.");
  });

  it("re-checks a field that depends on another one", () => {
    const { name, confirm, errors, leave, isValid } = setup();

    name.value = "abc";
    confirm.value = "abc";
    leave("confirm");
    expect(isValid.value).toBe(true);

    name.value = "abcd";
    expect(errors.value.confirm).toBe("No match.");
    expect(isValid.value).toBe(false);
  });

  it("shows every problem on submit and focuses the first invalid field", async () => {
    const { validate, errors } = setup();
    const root = document.createElement("form");
    root.innerHTML = '<input aria-invalid="true" id="first" /><input aria-invalid="true" />';
    document.body.append(root);

    await expect(validate(root)).resolves.toBe(false);

    expect(errors.value).toEqual({ name: "Too short.", confirm: "" });
    expect(document.activeElement?.id).toBe("first");
    root.remove();
  });

  it("only shows the fields asked for, and needs no root to focus", async () => {
    const { name, validate, errors } = setup();
    name.value = "abc";

    await expect(validate(null, ["name"])).resolves.toBe(true);
    await expect(validate(undefined, ["confirm"])).resolves.toBe(false);

    expect(errors.value).toEqual({ name: "", confirm: "No match." });
  });

  it("shows the API's refusal of a field until that field is edited", () => {
    const { name, confirm, setError, errors, isValid } = setup();
    name.value = confirm.value = "abc";

    setError("name", "Taken.");
    expect(errors.value.name).toBe("Taken.");
    expect(isValid.value).toBe(false);

    confirm.value = "abcd";
    expect(errors.value.name).toBe("Taken.");

    name.value = "abcd";
    expect(errors.value.name).toBe("");
    expect(isValid.value).toBe(true);
  });

  it("forgets everything shown on reset", async () => {
    const { name, validate, setError, reset, errors, leave } = setup();
    await validate();
    setError("confirm", "Taken.");

    name.value = "";
    reset();

    expect(errors.value).toEqual({ name: "", confirm: "" });
    // The cleared value doesn't count as an edit.
    leave("name");
    expect(errors.value.name).toBe("");
  });
});
