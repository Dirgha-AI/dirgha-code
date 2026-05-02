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
    // Keep the @-file overlay in sync with the input token.
    React.useEffect(() => {
        if (atQuery === null) {
            if (active === "atfile")
                setActive(null);
            return;
        }
        if (active === null || active === "slash")
            setActive("atfile");
    }, [atQuery, active]);
    // Keep the slash overlay in sync with the input token.
    React.useEffect(() => {
        if (slashQuery === null) {
            if (active === "slash")
                setActive(null);
            return;
        }
        if (active === null)
            setActive("slash");
    }, [slashQuery, active]);
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