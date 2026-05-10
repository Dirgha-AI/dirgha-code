/**
 * Overlay + input-assist state hook for the Ink root component.
 *
 * Owns the four overlay channels (model picker, help, @-file completion)
 * plus the `@` query and any other state that would otherwise bloat
 * App.tsx. Extracted so App stays under 500 LOC as the feature surface
 * grew (model picker, help, vim mode, paste-collapse, at-file complete).
 */
import * as React from "react";
export function useOverlays() {
    const [active, setActive] = React.useState(null);
    const [atQuery, setAtQuery] = React.useState(null);
    const [slashQuery, setSlashQuery] = React.useState(null);
    // Single effect for @-file and slash overlays to avoid racing reads/writes
    // on `active` when both tokens appear simultaneously (e.g. "/command @file").
    // `active` is intentionally excluded from the dependency array: the effect
    // only writes to it, never reads it in a way that requires re-running on
    // every active change. Including it caused two renders per overlay activation
    // (the setActive call triggers a re-run, which calls setActive again with the
    // same value). The functional-update form with same-value guards prevents
    // React from scheduling a redundant re-render.
    React.useEffect(() => {
        if (atQuery !== null) {
            // Only activate atfile if no higher-priority overlay is open.
            setActive((cur) => cur === null || cur === "slash" ? "atfile" : cur);
        }
        else {
            setActive((cur) => (cur === "atfile" ? null : cur));
        }
        if (slashQuery !== null) {
            setActive((cur) => (cur === null ? "slash" : cur));
        }
        else {
            setActive((cur) => (cur === "slash" ? null : cur));
        }
    }, [atQuery, slashQuery]);
    const openOverlay = React.useCallback((k) => {
        setActive(k);
    }, []);
    const closeOverlay = React.useCallback(() => {
        setActive(null);
        setAtQuery(null);
        setSlashQuery(null);
    }, []);
    const spliceAtSelection = React.useCallback((value, selected) => {
        const idx = value.lastIndexOf("@");
        if (idx === -1)
            return value;
        // Replace `@query` (up to next whitespace or end) with the path.
        let end = idx + 1;
        while (end < value.length && !/\s/.test(value[end] ?? ""))
            end += 1;
        return `${value.slice(0, idx)}@${selected}${value.slice(end)}`;
    }, []);
    const spliceSlashSelection = React.useCallback((value, selected) => {
        if (!value.startsWith("/"))
            return `/${selected}`;
        // Replace `/query` up to first whitespace; preserve the tail.
        let end = 1;
        while (end < value.length && !/\s/.test(value[end] ?? ""))
            end += 1;
        return `/${selected}${value.slice(end)}`;
    }, []);
    return React.useMemo(() => ({
        active,
        setActive,
        atQuery,
        setAtQuery,
        slashQuery,
        setSlashQuery,
        openOverlay,
        closeOverlay,
        spliceAtSelection,
        spliceSlashSelection,
    }), [
        active,
        atQuery,
        slashQuery,
        openOverlay,
        closeOverlay,
        spliceAtSelection,
        spliceSlashSelection,
    ]);
}
//# sourceMappingURL=use-overlays.js.map