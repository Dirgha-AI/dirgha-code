/**
 * skills/generator.ts — Auto-generate SKILL.md from command definitions.
 * Inspired by CLI-Anything skill_generator.py.
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import type { SkillDef, CommandSpec } from '../agent/types.js';

/** Generate YAML frontmatter SKILL.md content. */
export function generateSkillMarkdown(skill: SkillDef): string {
  const cmdYaml = skill.commands.map(cmd => {
    const argsYaml = cmd.args.map(a => 
      `      - name: ${a.name}\n        type: ${a.type}\n        required: ${a.required}`
    ).join('\n');
    
    const flagsYaml = cmd.flags.map(f => 
      `      - name: ${f.name}${f.short ? `\n        short: ${f.short}` : ''}\n        type: ${f.type}`
    ).join('\n');

    return `  - name: ${cmd.name}\n    description: ${cmd.description}\n    output: ${cmd.output}${argsYaml ? `\n    args:\n${argsYaml}` : ''}${flagsYaml ? `\n    flags:\n${flagsYaml}` : ''}`;
  }).join('\n');

  return `---
name: ${skill.name}
version: ${skill.version}
description: ${skill.description}
commands:
${cmdYaml}
---

# ${skill.name}

${skill.description}

## Available Commands

${skill.commands.map(cmd => `### ${cmd.name}\n\n${cmd.description}\n\n**Output:** ${cmd.output}\n\n${cmd.examples.length ? `**Examples:**\n${cmd.examples.map(e => `- \`${e}\``).join('\n')}\n\n` : ''}`).join('')}

## Agent Usage Notes

- All commands support \`--json\` for structured output
- Use \`--help\` for full flag documentation
- Exit codes: 0 (success), 1 (error), 130 (cancelled)
`;
}

/** Write SKILL.md to package directory. */
export function writeSkillFile(skill: SkillDef, outDir: string): string {
  const md = generateSkillMarkdown(skill);
  const path = join(outDir, 'SKILL.md');
  writeFileSync(path, md, 'utf-8');
  return path;
}

/** Build skill def from command registry (for Dirgha CLI). */
export function buildDirghaSkill(): SkillDef {
  return {
    name: 'dirgha-cli',
    version: '2.0.0',
    description: 'AI-powered coding assistant CLI with chat, knowledge graph, and code execution',
    commands: [
      {
        name: 'chat',
        description: 'Start AI conversation with streaming responses',
        args: [{ name: 'message', type: 'string', required: false, description: 'Initial message' }],
        flags: [
          { name: 'model', short: 'm', type: 'string', description: 'Model ID' },
          { name: 'json', type: 'boolean', default: false, description: 'Output JSON instead of streaming text' }
        ],
        output: 'both',
        examples: ['dirgha chat', 'dirgha chat "How do I fix this bug?"', 'dirgha chat --json']
      },
      {
        name: 'clip',
        description: 'Capture web content and add to knowledge graph',
        args: [{ name: 'url', type: 'string', required: true, description: 'URL to capture' }],
        flags: [
          { name: 'category', short: 'c', type: 'string', description: 'Category (Study/Build/Steal/Integrate)' },
          { name: 'json', type: 'boolean', default: false, description: 'Output structured data' }
        ],
        output: 'json',
        examples: ['dirgha clip https://example.com --category Study']
      }
    ]
  };
}
