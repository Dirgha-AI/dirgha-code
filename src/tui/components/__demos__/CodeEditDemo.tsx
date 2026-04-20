/**
 * CodeEditDemo.tsx — Demonstration of transparent code editing UI
 * 
 * Run: pnpm tsx src/tui/components/__demos__/CodeEditDemo.tsx
 */
import React from 'react';
import { render } from 'ink';
import { Box, Text } from 'ink';
import { CodeEditBox, createCodeEdit, type CodeEdit } from '../CodeEditBox.js';
import { C } from '../../colors.js';

// Sample code edits showing different types
const sampleEdits: CodeEdit[] = [
  createCodeEdit(
    'create',
    'src/utils/logger.ts',
    `import { createLogger, format, transports } from 'winston';

export const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'app.log' })
  ]
});`,
    {
      description: 'Add structured logging with Winston',
      language: 'typescript',
      lineStart: 1,
    }
  ),
  createCodeEdit(
    'modify',
    'src/config/database.ts',
    `export const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'myapp',
  maxConnections: 20,        // NEW: Connection pooling
  idleTimeoutMillis: 30000,    // NEW: Idle timeout
  connectionTimeoutMillis: 2000, // NEW: Connection timeout
};`,
    {
      description: 'Add connection pooling parameters',
      language: 'typescript',
      lineStart: 1,
    }
  ),
  createCodeEdit(
    'delete',
    'src/legacy/auth-old.ts',
    `// This file has been removed
// Authentication migrated to src/auth/modern.ts`,
    {
      description: 'Remove legacy authentication (superseded by new system)',
      language: 'typescript',
      lineStart: 1,
    }
  ),
  createCodeEdit(
    'patch',
    'package.json',
    `{
  "name": "my-app",
  "version": "1.2.3",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "jest --coverage"  // PATCHED: Added coverage flag
  },
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  }
}`,
    {
      description: 'Add test coverage to CI pipeline',
      language: 'json',
      lineStart: 1,
    }
  ),
];

// Demo component showing the Gemini-style interface
function Demo(): React.JSX.Element {
  return (
    <Box flexDirection="column" padding={1}>
      {/* Narrative/thoughts OUTSIDE round boxes */}
      <Box marginBottom={1}>
        <Text color={C.textSecondary}>
          I'll help you set up the project infrastructure. Let me create the necessary files:
        </Text>
      </Box>

      <Box marginBottom={1} marginLeft={2}>
        <Text color={C.textDim}>
          1. First, I'll add a proper logging system to help with debugging
        </Text>
      </Box>

      {/* Code edits INSIDE round boxes */}
      <CodeEditBox 
        edits={[sampleEdits[0]]} 
        showLineNumbers={true}
        expandedByDefault={true}
      />

      <Box marginTop={1} marginLeft={2}>
        <Text color={C.textDim}>
          2. Now I'll update the database configuration with connection pooling
        </Text>
      </Box>

      <CodeEditBox 
        edits={[sampleEdits[1]]} 
        showLineNumbers={true}
        expandedByDefault={false}
      />

      <Box marginTop={1} marginLeft={2}>
        <Text color={C.textDim}>
          3. Cleaning up the old authentication system that we no longer need
        </Text>
      </Box>

      <CodeEditBox 
        edits={[sampleEdits[2]]} 
        showLineNumbers={true}
        expandedByDefault={false}
      />

      <Box marginTop={1} marginLeft={2}>
        <Text color={C.textDim}>
          4. Finally, I'll patch the package.json to include test coverage in CI
        </Text>
      </Box>

      <CodeEditBox 
        edits={[sampleEdits[3]]} 
        showLineNumbers={false}
        expandedByDefault={false}
      />

      {/* Summary OUTSIDE round box */}
      <Box marginTop={2}>
        <Text color={C.accent} bold>
          ✅ Summary: 4 files modified
        </Text>
      </Box>

      <Box marginLeft={2} flexDirection="column">
        <Text color={C.textFaint}>Created: logger.ts (NEW)</Text>
        <Text color={C.textFaint}>Modified: database.ts (EDIT)</Text>
        <Text color={C.textFaint}>Deleted: auth-old.ts (DEL)</Text>
        <Text color={C.textFaint}>Patched: package.json (PATCH)</Text>
      </Box>
    </Box>
  );
}

// Run the demo
console.clear();
console.log('CodeEditBox Demo - Gemini-style transparent code editing\n');
console.log('Features:');
console.log('  • Round-corner boxes for all code edits');
console.log('  • Pill-shaped type badges (NEW/EDIT/DEL/PATCH)');
console.log('  • Syntax highlighting');
console.log('  • Line numbers with context');
console.log('  • Collapsible sections');
console.log('  • Thoughts OUTSIDE boxes, edits INSIDE boxes\n');

const { unmount } = render(<Demo />);

// Auto-unmount after 10 seconds for demo
setTimeout(() => {
  unmount();
  console.log('\nDemo complete. Run again with: pnpm tsx CodeEditDemo.tsx');
}, 10000);

export default Demo;
