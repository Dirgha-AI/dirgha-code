/**
 * Skills System — Reusable agent skills
 * Supports SKILL.md format with YAML frontmatter
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";

export interface SkillFrontmatter {
  name: string;
  description: string;
  [key: string]: any;
}

export interface SkillFile {
  path: string;
  content: string;
}

export interface Skill {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  config: Record<string, any>;
  files: SkillFile[];
  createdBy: string;
  createdAt: number;
}

export interface SkillRegistry {
  register(skill: Skill): void;
  unregister(skillId: string): void;
  getByName(name: string, workspaceId?: string): Skill | undefined;
  getForAgent(agentId: string, workspaceId?: string): Skill[];
  list(workspaceId?: string): Skill[];
  discoverLocal(provider: string): Skill[];
}

// In-memory implementation
const skillStore = new Map<string, Skill>();
const agentSkills = new Map<string, Set<string>>(); // agentId -> Set<skillId>

export const InMemorySkillRegistry: SkillRegistry = {
  register(skill) {
    skillStore.set(skill.id, skill);
  },

  unregister(skillId) {
    skillStore.delete(skillId);
    // Remove from all agents
    const values = Array.from(agentSkills.values());
    for (const skills of values) {
      skills.delete(skillId);
    }
  },

  getByName(name, workspaceId) {
    const values = Array.from(skillStore.values());
    return values
      .filter(
        (s) =>
          s.name === name && (!workspaceId || s.workspaceId === workspaceId),
      )
      .shift();
  },

  getForAgent(agentId, workspaceId) {
    const skillIds = agentSkills.get(agentId);
    if (!skillIds) return [];
    const ids = Array.from(skillIds);
    return ids
      .map((id) => skillStore.get(id))
      .filter((s): s is Skill => !!s)
      .filter((s) => !workspaceId || s.workspaceId === workspaceId);
  },

  list(workspaceId) {
    const values = Array.from(skillStore.values());
    return values.filter((s) => !workspaceId || s.workspaceId === workspaceId);
  },

  discoverLocal(provider) {
    // Map providers to their local skills directories
    const skillDirs: Record<string, string> = {
      claude: join(process.env.HOME || "~", ".claude", "skills"),
      codex: join(process.env.HOME || "~", ".codex", "skills"),
      opencode: join(process.env.HOME || "~", ".config", "opencode", "skills"),
      openclaw: join(process.env.HOME || "~", ".openclaw", "skills"),
      pi: join(process.env.HOME || "~", ".pi", "agent", "skills"),
      cursor: join(process.env.HOME || "~", ".cursor", "skills"),
    };

    const dir = skillDirs[provider.toLowerCase()];
    if (!dir) return [];

    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      return entries
        .filter((e) => e.isDirectory())
        .map((e) => {
          const skillPath = join(dir, e.name);
          const skillFile = join(skillPath, "SKILL.md");
          try {
            const content = readFileSync(skillFile, "utf8");
            const { frontmatter, body } = parseSkillMarkdown(content);
            return {
              id: `local-${provider}-${e.name}`,
              workspaceId: "default",
              name: frontmatter.name || e.name,
              description: frontmatter.description || "",
              config: frontmatter,
              files: [{ path: skillFile, content: body }],
              createdBy: "local-discovery",
              createdAt: Date.now(),
            } as Skill;
          } catch {
            return null;
          }
        })
        .filter((s): s is Skill => !!s);
    } catch {
      return [];
    }
  },
};

function parseSkillMarkdown(content: string): {
  frontmatter: SkillFrontmatter;
  body: string;
} {
  const match = /^(---\s*\n[\s\S]*?\n---\s*\n)([\s\S]*)$/.exec(content);
  if (!match) {
    return { frontmatter: { name: "unknown", description: "" }, body: content };
  }

  const fm: any = {};
  const fmText = match[1]!.replace(/^---\s*\n|---\s*\n$/g, "");
  fmText.split("\n").forEach((line) => {
    const idx = line.indexOf(":");
    if (idx > 0) {
      fm[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  });

  return { frontmatter: fm as SkillFrontmatter, body: match[2]! };
}

/** Assign a skill to an agent */
export function assignSkillToAgent(agentId: string, skillId: string): void {
  if (!agentSkills.has(agentId)) {
    agentSkills.set(agentId, new Set());
  }
  agentSkills.get(agentId)!.add(skillId);
}

/** Remove a skill from an agent */
export function removeSkillFromAgent(agentId: string, skillId: string): void {
  agentSkills.get(agentId)?.delete(skillId);
}

/** Load skills for task execution */
export function loadSkillsForTask(task: {
  agentId?: string;
  workspaceId: string;
}): Skill[] {
  const agentId = task.agentId;
  if (!agentId) return [];
  return InMemorySkillRegistry.getForAgent(agentId, task.workspaceId);
}
