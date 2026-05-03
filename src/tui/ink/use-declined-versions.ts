/**
 * Tracks declined update versions in ~/.dirgha/state.json so the
 * update banner doesn't re-prompt for versions the user already saw
 * and dismissed.
 */

import * as React from "react";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const STATE_PATH = join(homedir(), ".dirgha", "state.json");

interface StateFile {
  declinedVersions?: string[];
  lastHealthCheck?: number;
}

async function readState(): Promise<StateFile> {
  try {
    const raw = await readFile(STATE_PATH, "utf8");
    return JSON.parse(raw) as StateFile;
  } catch {
    return {};
  }
}

async function writeState(state: StateFile): Promise<void> {
  try {
    await mkdir(join(homedir(), ".dirgha"), { recursive: true });
    await writeFile(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
  } catch {
    /* best-effort */
  }
}

export interface DeclinedVersionsApi {
  /** Check whether a given version was previously declined. */
  isDeclined(version: string): boolean;
  /** Persist a declined version so it won't be re-prompted. */
  decline(version: string): void;
  /** Load the set of declined versions (async, for initial render). */
  loadDeclined(): Promise<Set<string>>;
}

export function useDeclinedVersions(): DeclinedVersionsApi {
  const declinedRef = React.useRef<Set<string>>(new Set());
  const loadedRef = React.useRef(false);

  const load = React.useCallback(async (): Promise<Set<string>> => {
    if (loadedRef.current) return declinedRef.current;
    const state = await readState();
    const set = new Set(state.declinedVersions ?? []);
    declinedRef.current = set;
    loadedRef.current = true;
    return set;
  }, []);

  const isDeclined = React.useCallback(
    (version: string): boolean => declinedRef.current.has(version),
    [],
  );

  const writeGateRef = React.useRef<Promise<void>>(Promise.resolve());

  const decline = React.useCallback((version: string): void => {
    declinedRef.current.add(version);
    // Serialize writes: two rapid decline() calls race on readState →
    // modify → writeState. Chain onto a promise gate so each write
    // completes before the next read.
    writeGateRef.current = writeGateRef.current.then(() =>
      readState()
        .then((state) => {
          state.declinedVersions = [...declinedRef.current];
          return writeState(state);
        })
        .catch(() => {}),
    );
  }, []);

  // Pre-load on hook mount.
  React.useEffect(() => {
    void load();
  }, [load]);

  return { isDeclined, decline, loadDeclined: load };
}
