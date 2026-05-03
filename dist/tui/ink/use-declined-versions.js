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
async function readState() {
    try {
        const raw = await readFile(STATE_PATH, "utf8");
        return JSON.parse(raw);
    }
    catch {
        return {};
    }
}
async function writeState(state) {
    try {
        await mkdir(join(homedir(), ".dirgha"), { recursive: true });
        await writeFile(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
    }
    catch {
        /* best-effort */
    }
}
export function useDeclinedVersions() {
    const declinedRef = React.useRef(new Set());
    const loadedRef = React.useRef(false);
    const load = React.useCallback(async () => {
        if (loadedRef.current)
            return declinedRef.current;
        const state = await readState();
        const set = new Set(state.declinedVersions ?? []);
        declinedRef.current = set;
        loadedRef.current = true;
        return set;
    }, []);
    const isDeclined = React.useCallback((version) => declinedRef.current.has(version), []);
    const writeGateRef = React.useRef(Promise.resolve());
    const decline = React.useCallback((version) => {
        declinedRef.current.add(version);
        // Serialize writes: two rapid decline() calls race on readState →
        // modify → writeState. Chain onto a promise gate so each write
        // completes before the next read.
        writeGateRef.current = writeGateRef.current.then(() => readState()
            .then((state) => {
            state.declinedVersions = [...declinedRef.current];
            return writeState(state);
        })
            .catch(() => { }));
    }, []);
    // Pre-load on hook mount.
    React.useEffect(() => {
        void load();
    }, [load]);
    return { isDeclined, decline, loadDeclined: load };
}
//# sourceMappingURL=use-declined-versions.js.map