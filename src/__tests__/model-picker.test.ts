import { describe, it, expect, vi } from "vitest";
import { detectPaste } from "../tui/ink/components/PasteCollapse.js";

/**
 * ModelPicker key-handler logic extracted for unit testing.
 * Mirrors ModelPicker.tsx lines 128-169.
 */
function handleModelPickerKey(
  ch: string,
  key: {
    escape: boolean;
    upArrow: boolean;
    downArrow: boolean;
    return: boolean;
    backspace: boolean;
    delete: boolean;
    ctrl: boolean;
    meta: boolean;
  },
  state: { filtered: string[]; cursor: number; filter: string },
  onPick: (id: string) => void,
  onCancel: () => void,
  setCursor: (fn: (c: number) => number) => void,
  setFilter: (fn: (f: string) => string) => void,
): void {
  if (key.escape) {
    if (state.filter.length > 0) {
      setFilter(() => "");
      return;
    }
    onCancel();
    return;
  }
  if (key.upArrow || (key.ctrl && ch === "p")) {
    setCursor((c) => Math.max(0, c - 1));
    return;
  }
  if (key.downArrow || (key.ctrl && ch === "n")) {
    setCursor((c) =>
      Math.min(Math.max(0, state.filtered.length - 1), c + 1),
    );
    return;
  }
  if (key.return || ch === "\n") {
    const picked = state.filtered[state.cursor];
    if (picked) onPick(picked);
    return;
  }
  if (key.backspace || key.delete) {
    setFilter((f) => f.slice(0, -1));
    return;
  }
  if (ch && /^[1-9]$/.test(ch) && state.filter.length === 0) {
    const n = Number(ch) - 1;
    if (n < state.filtered.length) {
      const picked = state.filtered[n];
      if (picked) onPick(picked);
    }
    return;
  }
  if (ch && !key.ctrl && !key.meta && /^[\w@\-./:]$/.test(ch)) {
    setFilter((f) => f + ch);
  }
}

describe("ModelPicker key handler", () => {
  const defaultKey = {
    escape: false,
    upArrow: false,
    downArrow: false as boolean,
    return: false as boolean,
    backspace: false,
    delete: false,
    ctrl: false,
    meta: false,
  };

  const makeState = (overrides?: Partial<{ filtered: string[]; cursor: number; filter: string }>) => ({
    filtered: overrides?.filtered ?? ["model-a", "model-b", "model-c"],
    cursor: overrides?.cursor ?? 0,
    filter: overrides?.filter ?? "",
  });

  it("picks current cursor model on Enter", () => {
    const onPick = vi.fn();
    const onCancel = vi.fn();
    const setCursor = vi.fn();
    const setFilter = vi.fn();

    const state = makeState({ cursor: 1 });

    handleModelPickerKey(
      "\r",
      { ...defaultKey, return: true },
      state,
      onPick,
      onCancel,
      setCursor,
      setFilter,
    );

    expect(onPick).toHaveBeenCalledWith("model-b");
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("does nothing on Enter when cursor is out of bounds", () => {
    const onPick = vi.fn();
    const onCancel = vi.fn();
    const setCursor = vi.fn();
    const setFilter = vi.fn();

    const state = makeState({ cursor: 5 }); // out of bounds

    handleModelPickerKey(
      "\r",
      { ...defaultKey, return: true },
      state,
      onPick,
      onCancel,
      setCursor,
      setFilter,
    );

    expect(onPick).not.toHaveBeenCalled();
  });

  it("Enter with empty filtered list does nothing", () => {
    const onPick = vi.fn();
    const onCancel = vi.fn();
    const setCursor = vi.fn();
    const setFilter = vi.fn();

    const state = makeState({ filtered: [] });

    handleModelPickerKey(
      "\r",
      { ...defaultKey, return: true },
      state,
      onPick,
      onCancel,
      setCursor,
      setFilter,
    );

    expect(onPick).not.toHaveBeenCalled();
  });

  it("Enter still works after typing filter characters", () => {
    const onPick = vi.fn();
    const onCancel = vi.fn();
    let cursor = 0;
    let filter = "";

    const state1 = makeState({ filter: "" });
    // Simulate typing "mo"
    handleModelPickerKey(
      "m",
      { ...defaultKey },
      state1,
      () => {},
      onCancel,
      (fn) => { cursor = fn(cursor); },
      (fn) => { filter = fn(filter); },
    );
    expect(filter).toBe("m");

    const state2 = makeState({ filter: "m", filtered: ["model-a", "model-b"], cursor: 0 });
    handleModelPickerKey(
      "o",
      { ...defaultKey },
      state2,
      () => {},
      onCancel,
      (fn) => { cursor = fn(cursor); },
      (fn) => { filter = fn(filter); },
    );
    // Now press Enter — should pick model-a (cursor at 0)
    const state3 = makeState({ filter: "mo", filtered: ["model-a", "model-b"], cursor: 0 });
    handleModelPickerKey(
      "\r",
      { ...defaultKey, return: true },
      state3,
      onPick,
      onCancel,
      (fn) => { cursor = fn(cursor); },
      (fn) => { filter = fn(filter); },
    );

    expect(onPick).toHaveBeenCalledWith("model-a");
  });

  it("Enter is not consumed by filter char check", () => {
    // '\r' does not match /^[\w@\-./:]$/
    expect(/^[\w@\-./:]$/.test("\r")).toBe(false);
    // '\n' does not match either
    expect(/^[\w@\-./:]$/.test("\n")).toBe(false);
  });

  it("numeral keys 1-9 work when filter is empty", () => {
    const onPick = vi.fn();
    const onCancel = vi.fn();
    const setCursor = vi.fn();
    const setFilter = vi.fn();

    const state = makeState();

    handleModelPickerKey(
      "2",
      { ...defaultKey },
      state,
      onPick,
      onCancel,
      setCursor,
      setFilter,
    );

    expect(onPick).toHaveBeenCalledWith("model-b");
  });

  it("Enter as LF (\\n) picks model when key.return is false", () => {
    const onPick = vi.fn();
    const onCancel = vi.fn();
    const setCursor = vi.fn();
    const setFilter = vi.fn();

    const state = makeState({ cursor: 0 });

    // Simulate LF-Enter: ch is '\n', key.return is false
    handleModelPickerKey(
      "\n",
      { ...defaultKey, return: false },
      state,
      onPick,
      onCancel,
      setCursor,
      setFilter,
    );

    expect(onPick).toHaveBeenCalledWith("model-a");
  });
});
