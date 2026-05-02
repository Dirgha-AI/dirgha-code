/**
 * Top-level markdown renderer.
 *
 * Parses arbitrary markdown text and renders each block with the
 * appropriate component (heading / paragraph / code / list / rule /
 * table / blockquote). Inline emphasis runs via `RenderInline`; code
 * fences run through the native `CodeColorizer`; tables run through
 * `TableRenderer`.
 *
 * Visual conventions (mirroring gemini-cli):
 *   #  → bold accent
 *   ## → bold accent + dim accent prefix line
 *   ### / #### → bold primary
 *   - / * / + → bullets with `•`/`◦`/`▪` per nesting depth
 *   1. 2. 3. → numbers right-aligned in a 2-col gutter
 *   > quote → left-bar + dim italic
 *   --- → horizontal rule
 *   ``` lang → bordered code block, syntax-highlighted
 */

import * as React from "react";
import { Box, Text } from "ink";
import type { Palette } from "../../theme.js";
import { type Block, type ListItem, IncrementalParser } from "./parser.js";
import { RenderInline } from "./inline.js";
import { CodeColorizer } from "./colorizer.js";
import { TableRenderer } from "./table.js";

const incremental = new IncrementalParser();

interface MarkdownProps {
  text: string;
  palette: Palette;
  width?: number;
}

export const MarkdownDisplay = React.memo(function MarkdownDisplay(
  props: MarkdownProps,
): React.ReactElement | null {
  const { text, palette, width = 80 } = props;
  if (!text) return null;
  const blocks = incremental.parse(text);
  return (
    <Box flexDirection="column">
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} palette={palette} width={width} idx={i} />
      ))}
    </Box>
  );
});

interface BlockViewProps {
  block: Block;
  palette: Palette;
  width: number;
  idx: number;
}

function BlockView({
  block,
  palette,
  width,
  idx,
}: BlockViewProps): React.ReactElement | null {
  switch (block.kind) {
    case "blank":
      return <Box height={1} />;

    case "heading": {
      const colour =
        block.level === 1
          ? palette.text.accent
          : block.level === 2
            ? palette.text.accent
            : palette.text.primary;
      const prefix = "#".repeat(block.level);
      return (
        <Box
          marginTop={idx === 0 ? 0 : 1}
          marginBottom={0}
          flexDirection="column"
        >
          <Text>
            <Text color={palette.ui.symbol} dimColor>
              {prefix}{" "}
            </Text>
            <Text bold color={colour}>
              <RenderInline
                text={block.text}
                palette={palette}
                baseColor={colour}
                keyPrefix={`h${idx}`}
              />
            </Text>
          </Text>
        </Box>
      );
    }

    case "paragraph":
      return (
        <Box>
          <RenderInline
            text={block.text}
            palette={palette}
            keyPrefix={`p${idx}`}
          />
        </Box>
      );

    case "code": {
      const lang = block.lang;
      const codeText = block.lines.join("\n");
      return (
        <Box
          marginY={0}
          paddingX={1}
          borderStyle="round"
          borderColor={palette.border.default}
          borderDimColor
          flexDirection="column"
        >
          {lang && (
            <Box>
              <Text color={palette.text.secondary} dimColor>
                {lang}
              </Text>
            </Box>
          )}
          <CodeColorizer code={codeText} lang={lang} palette={palette} />
        </Box>
      );
    }

    case "list":
      return (
        <Box flexDirection="column">
          {block.items.map((item, i) => (
            <ListItemRow
              key={i}
              item={item}
              palette={palette}
              ordered={block.ordered}
              numberWidth={String(block.items.length).length}
              keyPrefix={`l${idx}-${i}`}
            />
          ))}
        </Box>
      );

    case "rule":
      return (
        <Box marginY={1}>
          <Text color={palette.border.default}>
            {"─".repeat(Math.max(20, Math.min(60, width - 4)))}
          </Text>
        </Box>
      );

    case "table":
      return (
        <TableRenderer
          headers={block.headers}
          rows={block.rows}
          align={block.align}
          palette={palette}
          maxWidth={width}
        />
      );

    case "blockquote":
      return (
        <Box flexDirection="row" marginY={0}>
          <Box marginRight={1}>
            <Text color={palette.text.accent}>│</Text>
          </Box>
          <Box flexDirection="column" flexGrow={1}>
            <Text italic color={palette.text.secondary}>
              <RenderInline
                text={block.text}
                palette={palette}
                baseColor={palette.text.secondary}
                keyPrefix={`q${idx}`}
              />
            </Text>
          </Box>
        </Box>
      );
  }
}

interface ListItemRowProps {
  item: ListItem;
  palette: Palette;
  ordered: boolean;
  numberWidth: number;
  keyPrefix: string;
}

function ListItemRow({
  item,
  palette,
  ordered,
  numberWidth,
  keyPrefix,
}: ListItemRowProps): React.ReactElement {
  const indent = Math.floor(item.depth / 2);
  const bullets = ["•", "◦", "▪", "▫"];
  const bullet = ordered
    ? `${item.marker.padStart(numberWidth, " ")}.`
    : bullets[indent % bullets.length];
  return (
    <Box flexDirection="row" paddingLeft={indent * 2}>
      <Box marginRight={1}>
        <Text color={palette.text.accent}>{bullet}</Text>
      </Box>
      <Box flexGrow={1}>
        <RenderInline
          text={item.text}
          palette={palette}
          keyPrefix={keyPrefix}
        />
      </Box>
    </Box>
  );
}
