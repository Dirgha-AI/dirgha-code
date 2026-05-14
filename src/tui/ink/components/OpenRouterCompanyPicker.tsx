/**
 * Third step in the OpenRouter picker flow:
 *   ProviderPicker → OpenRouterCompanyPicker → ModelPicker (filtered)
 *
 * Lists upstream company prefixes available on OpenRouter so the user
 * can narrow the model list before seeing hundreds of entries.
 *
 * Keys: ↑↓ / k j / ctrl+p ctrl+n  navigate
 *       1-9   jump
 *       enter pick → opens ModelPicker filtered to this company
 *       esc   go back to ProviderPicker
 *       type  fuzzy-filter the company names
 */

import * as React from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { useTheme } from "../theme-context.js";

export interface CompanyEntry {
  /** Prefix/slug used to filter models, e.g. "anthropic", "deepseek" */
  id: string;
  /** Human-readable label, e.g. "Anthropic" */
  label: string;
  /** How many OR models belong to this company */
  modelCount: number;
  /** Optional short description */
  blurb?: string;
  /** True when the user's current model belongs to this company */
  isCurrent?: boolean;
}

export interface OpenRouterCompanyPickerProps {
  companies: CompanyEntry[];
  onPick: (companyId: string) => void;
  onCancel: () => void;
}

export function OpenRouterCompanyPicker(
  props: OpenRouterCompanyPickerProps,
): React.JSX.Element {
  const { stdout } = useStdout();
  const palette = useTheme();
  const cols = stdout?.columns ?? 80;
  const width = Math.max(40, cols - 4);

  const [filter, setFilter] = React.useState("");
  const filtered = React.useMemo(() => {
    if (!filter) return props.companies;
    const needle = filter.toLowerCase();
    return props.companies.filter(
      (c) =>
        c.id.toLowerCase().includes(needle) ||
        c.label.toLowerCase().includes(needle) ||
        (c.blurb?.toLowerCase().includes(needle) ?? false),
    );
  }, [props.companies, filter]);

  const initial = Math.max(
    0,
    filtered.findIndex((c) => c.isCurrent),
  );
  const [cursor, setCursor] = React.useState(initial);

  React.useEffect(() => {
    setCursor((prev) => Math.min(prev, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  useInput(
    (ch, key) => {
      if (key.escape) {
        if (filter) {
          setFilter("");
          return;
        }
        props.onCancel();
        return;
      }
      if (key.upArrow || (key.ctrl && ch === "p")) {
        setCursor((c) => Math.max(0, c - 1));
        return;
      }
      if (key.downArrow || (key.ctrl && ch === "n")) {
        setCursor((c) =>
          Math.min(Math.max(0, filtered.length - 1), c + 1),
        );
        return;
      }
      if (key.return) {
        const picked = filtered[cursor];
        if (picked) props.onPick(picked.id);
        return;
      }
      if (key.backspace || key.delete) {
        setFilter((f) => f.slice(0, -1));
        return;
      }
      if (ch && /^[1-9]$/.test(ch) && !filter) {
        const n = Number(ch) - 1;
        if (n < filtered.length) {
          const picked = filtered[n];
          if (picked) props.onPick(picked.id);
        }
        return;
      }
      if (ch && !key.ctrl && !key.meta && /^[\w@\-./:]$/.test(ch)) {
        setFilter((f) => f + ch);
      }
    },
    { isActive: true },
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={palette.text.accent}
      paddingX={1}
      width={width}
    >
      <Box justifyContent="space-between">
        <Text color={palette.text.accent} bold>
          OpenRouter · pick a company
        </Text>
        {filter ? (
          <Text color={palette.text.accent}>
            <Text color={palette.text.secondary} dimColor>
              filter:{" "}
            </Text>
            {filter}
            <Text color={palette.text.secondary} dimColor>
              {" "}
              ({filtered.length})
            </Text>
          </Text>
        ) : (
          <Text color={palette.text.secondary} dimColor>
            {filtered.length} companies · then pick a model
          </Text>
        )}
      </Box>

      <Box marginTop={1} flexDirection="column">
        {filtered.length === 0 && (
          <Text color={palette.text.secondary} dimColor>
            No companies match &quot;{filter}&quot;.
          </Text>
        )}
        {filtered.map((c, idx) => {
          const isCursor = idx === cursor;
          const lead = isCursor ? "▸" : c.isCurrent ? "●" : " ";
          const num = idx < 9 && !filter ? String(idx + 1) : " ";
          const labelColour = isCursor
            ? palette.text.primary
            : c.isCurrent
              ? palette.text.accent
              : palette.text.secondary;
          return (
            <Box key={c.id} flexDirection="row" paddingLeft={1}>
              <Box minWidth={2} flexShrink={0}>
                <Text
                  color={
                    isCursor
                      ? palette.text.accent
                      : c.isCurrent
                        ? palette.text.accent
                        : palette.text.secondary
                  }
                >
                  {lead}
                </Text>
              </Box>
              <Box minWidth={2} flexShrink={0}>
                <Text color={palette.text.secondary} dimColor>
                  {num}
                </Text>
              </Box>
              <Box flexShrink={1}>
                <Text color={labelColour} bold={isCursor} wrap="wrap">
                  {c.label}
                </Text>
              </Box>
              <Box flexGrow={1} flexShrink={1}>
                <Text color={palette.text.secondary} dimColor wrap="wrap">
                  {c.blurb ?? ""}
                </Text>
              </Box>
              <Box
                minWidth={10}
                flexShrink={0}
                justifyContent="flex-end"
              >
                <Text color={palette.text.secondary} dimColor>
                  {c.modelCount} model{c.modelCount === 1 ? "" : "s"}
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
        borderColor={palette.border.default}
        flexDirection="column"
      >
        <Box justifyContent="space-between">
          <Text color={palette.text.secondary} dimColor>
            <Text bold color={palette.text.primary}>
              ↑↓
            </Text>{" "}
            nav{"   "}
            <Text bold color={palette.text.primary}>
              enter
            </Text>{" "}
            models{"   "}
            <Text bold color={palette.text.primary}>
              1-9
            </Text>{" "}
            jump
          </Text>
          <Text color={palette.text.secondary} dimColor>
            <Text bold color={palette.text.primary}>
              type
            </Text>{" "}
            filter{"   "}
            <Text bold color={palette.text.primary}>
              esc
            </Text>{" "}
            {filter ? "clear" : "back"}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
