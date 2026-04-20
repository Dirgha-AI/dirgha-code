import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';

const VERSION = '0.1.0';

const PALETTES: any = {
  'cosmic':        { border: '#FF006E', rows: ['#FB5607','#FFBE0B','#8338EC','#3A86FF','#06FFA5','#FF006E'], tag: '#FFBE0B' },
  'obsidian-gold': { border: '#C47C0A', rows: ['#F5C518','#E8A015','#D4890A','#C47C0A','#F5C518','#FFF8E7'], tag: '#F5C518' },
  'dirgha-blue':   { border: '#0043CE', rows: ['#A6C8FF','#82CFFF','#4589FF','#0F62FE','#0043CE','#A6C8FF'], tag: '#4589FF' },
  'matrix':        { border: '#006B18', rows: ['#39FF14','#00FF41','#00D936','#00B32C','#008F22','#00FF41'], tag: '#39FF14' },
  'crimson':       { border: '#C10023', rows: ['#FFB3C1','#FF6B8A','#FF2952','#DC143C','#C10023','#FF6B8A'], tag: '#FF2952' },
  'nord':          { border: '#5E81AC', rows: ['#88C0D0','#8FBCBB','#81A1C1','#5E81AC','#A3BE8C','#EBCB8B'], tag: '#88C0D0' },
  'sakura':        { border: '#C4306A', rows: ['#FFF0F3','#FFB7C5','#FF85A1','#FF5C8D','#E0457B','#FFB7C5'], tag: '#FF85A1' },
  'ember':         { border: '#FF4500', rows: ['#FFF176','#FFD700','#FFB300','#FF8C00','#FF6A00','#FF4500'], tag: '#FFD700' },
  'violet-storm':  { border: '#5B21B6', rows: ['#EDE9FE','#C4B5FD','#A78BFA','#8B5CF6','#7C3AED','#6D28D9'], tag: '#A78BFA' },
  'mono-white':    { border: '#555555', rows: ['#FFFFFF','#E5E5E5','#CCCCCC','#B3B3B3','#999999','#CCCCCC'],  tag: '#FFFFFF' },
};

function getPalette() {
  let name = process.env['DIRGHA_LOGO_THEME'] || '';
  if (!name) {
    try {
      const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.dirgha', 'config.json'), 'utf8'));
      name = cfg.logoTheme || '';
    } catch {}
  }
  return PALETTES[name] || PALETTES['violet-storm'];
}

const P = getPalette();
const B = (s: string) => chalk.hex(P.border)(s);
const R = (i: number, s: string) => chalk.hex(P.rows[i]!)(s);

const WIDE = [
  '',
  B('    ╭──────────────────────────────────────────────────────────╮'),
  B('    │') + R(0, '  ██████╗ ██╗██████╗  ██████╗ ██╗  ██╗ █████╗ ') + B('│'),
  B('    │') + R(1, '  ██╔══██╗██║██╔══██╗██╔════╝ ██║  ██║██╔══██╗') + B('│'),
  B('    │') + R(2, '  ██║  ██║██║██████╔╝██║  ███╗███████║███████║') + B('│'),
  B('    │') + R(3, '  ██║  ██║██║██╔══██╗██║   ██║██╔══██║██╔══██║') + B('│'),
  B('    │') + R(4, '  ██████╔╝██║██║  ██║╚██████╔╝██║  ██║██║  ██║') + B('│'),
  B('    │') + R(5, '  ╚═════╝ ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝') + B('│'),
  B('    ╰──────────────────────────────────────────────────────────╯'),
  '',
  chalk.hex(P.tag)('    ✦ ') + R(1, 'Dirgha Code') + R(2, ' · ') + R(3, 'dirgha.ai') + chalk.hex(P.tag)(' ✦') + R(5, '        ' + VERSION + '  /model'),
  '',
].join('\n');

const COMPACT = [
  '',
  B('  ◆ ') + R(0, 'D') + R(1, 'I') + R(2, 'R') + R(3, 'G') + R(4, 'H') + R(5, 'A') + B(' ◆'),
  chalk.hex(P.tag)('  ✦ Dirgha Code ') + R(2, 'v' + VERSION) + chalk.hex(P.tag)(' ✦'),
  R(3, '  dirgha.ai · /help'),
  '',
].join('\n');

export const LOGO = (() => {
  const cols = process.stdout.columns ?? 0;
  return cols === 0 || cols >= 60 ? WIDE : COMPACT;
})();
