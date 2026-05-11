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
import type { GPUJob } from "../../../gpu/jobs.js";

const POLL_MS = 5_000;

export function GPUJobIndicator(): React.JSX.Element | null {
  const palette = useTheme();
  const [running, setRunning] = React.useState<GPUJob[]>([]);
  const [totalSpend, setTotalSpend] = React.useState(0);

  React.useEffect(() => {
    function poll() {
      listGPUJobs("running")
        .then((jobs) => {
          setRunning(jobs);
          return totalGPUSpend();
        })
        .then((spend) => setTotalSpend(spend))
        .catch(() => {});
    }
    poll();
    const iv = setInterval(poll, POLL_MS);
    return () => clearInterval(iv);
  }, []);

  if (running.length === 0 && totalSpend === 0) return null;

  return (
    <Box flexDirection="column" paddingX={1} marginBottom={0}>
      {running.length > 0 && (
        <Box flexDirection="column">
          <Text color={palette.text.secondary}>
            GPU ({running.length} running)
          </Text>
          {running.map((j) => {
            const elapsed = ((Date.now() - new Date(j.startedAt).getTime()) / 3600000);
            const cost = elapsed * j.costPerHr;
            return (
              <Text key={j.id} color={palette.textMuted}>
                {"  "}🔄 {j.gpuType} — ${cost.toFixed(4)} (${j.costPerHr.toFixed(2)}/hr)
              </Text>
            );
          })}
        </Box>
      )}
      {totalSpend > 0 && running.length === 0 && (
        <Text color={palette.text.secondary}>
          GPU total spend: ${totalSpend.toFixed(2)}
        </Text>
      )}
    </Box>
  );
}
