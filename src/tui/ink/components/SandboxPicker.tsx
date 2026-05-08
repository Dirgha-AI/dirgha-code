/**
 * Modal overlay for the sandbox-mode toggle.
 *
 * Same interaction grammar as ThemePicker / ModelPicker — arrow keys
 * move the cursor, Enter selects, Esc / `q` cancels, digits 1-3 jump.
 *
 * Each row shows the mode name + a one-line description so the user
 * sees the trade-off (filesystem confinement, network policy) at the
 * point of choosing.
 */

import * as React from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { useTheme } from "../theme-context.js";

export type SandboxMode = "off" | "auto" | "strict";

export interface SandboxPickerProps {
  current: SandboxMode;
  onPick: (mode: SandboxMode) => void;
  onCancel: () => void;
}

const MODES: ReadonlyArray<{
  id: SandboxMode;
  label: string;
  description: string;
}> = [
  {
    id: "off",
    label: "off",
    description:
      "Tools run with user privileges. Default. No containment.",
  },
  {
    id: "auto",
    label: "auto",
    description:
      "shell/git/lsp confined to cwd via platform sandbox. Network allowed (npm install / git pull work).",
  },
  {
    id: "strict",
    label: "strict",
    description:
      "cwd-only writes + network blocked. Catches exfiltration and curl|sh attacks. Power-user opt-in.",
  },
];

export function SandboxPicker(props: SandboxPickerProps): React.JSX.Element {
  const { stdout } = useStdout();
  const palette = useTheme();
  const cols = stdout?.columns ?? 80;
  const width = Math.min(cols - 4, 72);

  const initial = Math.max(
    0,
    MODES.findIndex((m) => m.id === props.current),
  );
  const [cursor, setCursor] = React.useState(initial);

  useInput(
    (ch, key) => {
      if (key.escape || ch === "q") {
        props.onCancel();
        return;
      }
      if (key.upArrow || ch === "k") {
        setCursor((c) => Math.max(0, c - 1));
        return;
      }
      if (key.downArrow || ch === "j") {
        setCursor((c) => Math.min(MODES.length - 1, c + 1));
        return;
      }
      if (key.return) {
        const picked = MODES[cursor];
        if (picked) props.onPick(picked.id);
        return;
      }
      if (ch && /^[1-3]$/.test(ch)) {
        const picked = MODES[Number(ch) - 1];
        if (picked) props.onPick(picked.id);
      }
    },
    { isActive: true },
  );

  const selected = MODES[cursor]?.id ?? props.current;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={palette.accent}
      paddingX={1}
      width={width}
    >
      <Box justifyContent="space-between">
        <Text color={palette.accent} bold>
          sandbox picker
        </Text>
        <Text color={palette.textMuted} dimColor>
          ↑↓ enter · 1-3 · esc
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        {MODES.map((m, i) => {
          const isCursor = i === cursor;
          const isCurrent = m.id === props.current;
          const prefix = isCursor ? ">" : isCurrent ? "•" : " ";
          const num = String(i + 1);
          return (
            <Box key={m.id} flexDirection="column" paddingLeft={1}>
              <Box gap={1}>
                <Text color={isCursor ? palette.accent : palette.textMuted}>
                  {prefix}
                </Text>
                <Text color={palette.textMuted} dimColor>
                  {num}
                </Text>
                <Box width={9}>
                  <Text
                    color={
                      isCursor
                        ? palette.textPrimary
                        : isCurrent
                          ? palette.accent
                          : palette.textMuted
                    }
                    bold={isCursor}
                  >
                    {m.label}
                  </Text>
                </Box>
                <Text
                  color={isCursor ? palette.textPrimary : palette.textMuted}
                  dimColor={!isCursor}
                >
                  {m.description}
                </Text>
              </Box>
            </Box>
          );
        })}
      </Box>

      <Box
        borderStyle="single"
        borderTop
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        borderColor={palette.borderIdle}
      >
        <Box gap={1}>
          <Text color={palette.textMuted} dimColor>
            →
          </Text>
          <Text color={palette.accent}>{selected}</Text>
          <Text color={palette.textMuted} dimColor>
            (writes to ~/.dirgha/config.json)
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
