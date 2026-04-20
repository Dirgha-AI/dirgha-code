import React from 'react';
import { Box, Text } from 'ink';

export function DiffLineItem({ line, cols, oldWidth, newWidth, style, numColor, padNum }: any) {
  const { bg, mark, markColor, textColor } = style;
  const oldCol = padNum(line.oldNum, oldWidth);
  const newCol = padNum(line.newNum, newWidth);
  const body = line.text.replace(/\t/g, '  ');
  const gutter = oldWidth + 1 + newWidth + 1 + 2;
  const room = Math.max(0, cols - gutter - 1);
  const clipped = body.length > room ? body.slice(0, Math.max(0, room - 1)) + '…' : body;
  const padRight = ' '.repeat(Math.max(0, room - clipped.length));

  return (
    <Box width={cols} backgroundColor={bg}>
      <Text color={numColor}>{oldCol} </Text>
      <Text color={numColor}>{newCol} </Text>
      <Text color={markColor} bold>{mark}</Text>
      <Text color={textColor}> {clipped}{padRight}</Text>
    </Box>
  );
}
