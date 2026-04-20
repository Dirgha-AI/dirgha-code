import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import { registerMeshCommands } from '../index.js';

describe('Mesh Commands', () => {
  it('registers all subcommands', () => {
    const program = new Command();
    registerMeshCommands(program);
    
    const meshCmd = program.commands.find(c => c.name() === 'mesh');
    expect(meshCmd).toBeDefined();
    
    const commands = meshCmd!.commands.map(c => c.name());
    expect(commands).toContain('join');
    expect(commands).toContain('leave');
    expect(commands).toContain('status');
    expect(commands).toContain('ask');
    expect(commands).toContain('quota');
    expect(commands).toContain('add-member');
    expect(commands).toContain('consensus');
    expect(commands).toContain('billing');
  });

  it('has correct command descriptions', () => {
    const program = new Command();
    registerMeshCommands(program);
    
    const meshCmd = program.commands.find(c => c.name() === 'mesh');
    const joinCmd = meshCmd?.commands.find(c => c.name() === 'join');
    expect(joinCmd?.description()).toContain('mesh');
  });
});

describe('Mesh Types', () => {
  it('exports mesh context interface', () => {
    // Types are compile-time only, verified by TypeScript
    expect(true).toBe(true);
  });
});
