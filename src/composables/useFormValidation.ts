import { computed, nextTick, reactive, watch, type Ref } from "vue";

/*
 * A field left by pressing the mouse elsewhere, e.g. on its form's key, shows its problem only once
 * the button is released: shown on mousedown, it would push the key away before the click lands.
 */
let isPressing = false;
let afterPress: (() => void)[] = [];
document.addEventListener("mousedown", () => (isPressing = true), true);
document.addEventListener(
  "mouseup",
  () => {
    isPressing = false;
    const waiting = afterPress;
    afterPress = [];
    // After the click this release makes.
    setTimeout(() => waiting.forEach((show) => show()));
  },
  true
);

/** How one field is checked. Both return the problem, or "" when there's none. */
export interface FieldRule {
  value: Ref<string>;
  /** The field's full check, shown once the field was edited and left, or after a submit. */
  check: () => string;
  /** Problems more typing can't fix (too long, a forbidden character), shown while typing. */
  early?: () => string;
}

/**
 * Checks a form's fields as they're filled in. A field shows its problem once it was edited and
 * left, then follows every keystroke, so the problem goes as soon as it's fixed. A submit shows
 * every field's problem at once. The API's refusal of a field (`setError`) shows until that field
 * is edited.
 */
export const useFormValidation = <K extends string>(rules: Record<K, FieldRule>) => {
  const fields = Object.keys(rules) as K[];
  const edited = reactive(new Set<string>());
  const shown = reactive(new Set<string>());
  const apiErrors = reactive<Record<string, string>>({});

  for (const field of fields) {
    // Sync, so a value cleared right before `reset()` doesn't count as edited afterwards.
    watch(
      rules[field].value,
      () => {
        edited.add(field);
        delete apiErrors[field];
      },
      { flush: "sync" }
    );
  }

  const problemOf = (field: K) => apiErrors[field] || rules[field].check();

  /** What each field shows now. */
  const errors = computed(
    () =>
      Object.fromEntries(
        fields.map((field) => [
          field,
          apiErrors[field] ||
            (shown.has(field) ? rules[field].check() : (rules[field].early?.() ?? ""))
        ])
      ) as Record<K, string>
  );

  /** Whether every field passes, shown or not: the submit key looks disabled until then. */
  const isValid = computed(() => fields.every((field) => !problemOf(field)));

  /** On blur: an edited field shows its problem from now on (after a click that moved focus). */
  const leave = (field: K) => {
    if (!edited.has(field)) return;
    if (isPressing) afterPress.push(() => shown.add(field));
    else shown.add(field);
  };

  /**
   * On submit: shows the problems of `only` (by default every field) and puts the cursor in the
   * first field within `root` that has one. Returns whether those fields all pass.
   */
  const validate = async (root?: HTMLElement | null, only: K[] = fields) => {
    only.forEach((field) => shown.add(field));
    if (only.every((field) => !problemOf(field))) return true;
    await nextTick();
    root?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
    return false;
  };

  /** The API refused this field; it shows until the field is edited. */
  const setError = (field: K, message: string) => {
    apiErrors[field] = message;
  };

  /** Back to a fresh form, e.g. once it's closed or sent: nothing is shown. */
  const reset = () => {
    edited.clear();
    shown.clear();
    fields.forEach((field) => delete apiErrors[field]);
  };

  return { errors, isValid, leave, validate, setError, reset };
};
