// @ts-nocheck
import chalk from 'chalk';
import { type TeamMember } from '../../mesh/TeamResourcePool.js';
import { getContext } from './context.js';
import { MeshAddMemberOptions } from './types.js';

export function handleAddMember(options: MeshAddMemberOptions): void {
  const ctx = getContext();
  
  if (!ctx.pool) {
    console.log(chalk.yellow('⚠️  Not connected to mesh'));
    return;
  }

  const member: TeamMember = {
    id: options.id,
    name: options.name,
    email: options.email,
    role: options.role,
    dailyTokenQuota: parseInt(options.quota || '0'),
    monthlyCostQuota: 0,
    canShareCompute: true,
    canUseMesh: true,
  };

  ctx.pool.addMember(member);
  console.log(chalk.green(`✅ Added member: ${options.name} (${options.role})`));
}
