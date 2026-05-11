import { jsxs as _jsxs } from "react/jsx-runtime";
/**
 * GPUJobIndicator — Shows running GPU jobs in the TUI.
 *
 * Polls ~/.dirgha/gpu-jobs.json every 5s and displays any running
 * GPU instances with cost tracking.
 */
import * as React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme-context.js";
import { listGPUJobs, totalGPUSpend } from "../../../gpu/jobs.js";
const POLL_MS = 5_000;
export function GPUJobIndicator() {
    const palette = useTheme();
    const [running, setRunning] = React.useState([]);
    const [totalSpend, setTotalSpend] = React.useState(0);
    React.useEffect(() => {
        function poll() {
            listGPUJobs("running")
                .then((jobs) => {
                setRunning(jobs);
                return totalGPUSpend();
            })
                .then((spend) => setTotalSpend(spend))
                .catch(() => { });
        }
        poll();
        const iv = setInterval(poll, POLL_MS);
        return () => clearInterval(iv);
    }, []);
    if (running.length === 0 && totalSpend === 0)
        return null;
    return (_jsxs(Box, { flexDirection: "column", paddingX: 1, marginBottom: 0, children: [running.length > 0 && (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { color: palette.text.secondary, children: ["GPU (", running.length, " running)"] }), running.map((j) => {
                        const elapsed = ((Date.now() - new Date(j.startedAt).getTime()) / 3600000);
                        const cost = elapsed * j.costPerHr;
                        return (_jsxs(Text, { color: palette.textMuted, children: ["  ", "\uD83D\uDD04 ", j.gpuType, " \u2014 $", cost.toFixed(4), " ($", j.costPerHr.toFixed(2), "/hr)"] }, j.id));
                    })] })), totalSpend > 0 && running.length === 0 && (_jsxs(Text, { color: palette.text.secondary, children: ["GPU total spend: $", totalSpend.toFixed(2)] }))] }));
}
//# sourceMappingURL=GPUJobIndicator.js.map