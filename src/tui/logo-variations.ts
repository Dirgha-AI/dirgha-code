/** tui/logo-variations.ts — Colorful logo options for Dirgha CLI */
import chalk from 'chalk';

export const VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════════
// OPTION 1: COSMIC RAINBOW (Current - 6 colors)
// Colors: Pink → Orange → Yellow → Purple → Blue → Green
// ═══════════════════════════════════════════════════════════════════════════════
export const LOGO_COSMIC = [
  '',
  chalk.hex('#FF006E')('    ╭──────────────────────────────────────────────────────────╮'),
  chalk.hex('#FF006E')('    │') + chalk.hex('#FB5607')('  ██████╗ ██╗██████╗  ██████╗ ██╗  ██╗ █████╗ ') + chalk.hex('#FF006E')('│'),
  chalk.hex('#FF006E')('    │') + chalk.hex('#FFBE0B')('  ██╔══██╗██║██╔══██╗██╔════╝ ██║  ██║██╔══██╗') + chalk.hex('#FF006E')('│'),
  chalk.hex('#FF006E')('    │') + chalk.hex('#8338EC')('  ██║  ██║██║██████╔╝██║  ███╗███████║███████║') + chalk.hex('#FF006E')('│'),
  chalk.hex('#FF006E')('    │') + chalk.hex('#3A86FF')('  ██║  ██║██║██╔══██╗██║   ██║██╔══██║██╔══██║') + chalk.hex('#FF006E')('│'),
  chalk.hex('#FF006E')('    │') + chalk.hex('#06FFA5')('  ██████╔╝██║██║  ██║╚██████╔╝██║  ██║██║  ██║') + chalk.hex('#FF006E')('│'),
  chalk.hex('#FF006E')('    │') + chalk.hex('#FF006E')('  ╚═════╝ ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝') + chalk.hex('#FF006E')('│'),
  chalk.hex('#FF006E')('    ╰──────────────────────────────────────────────────────────╯'),
  '',
  chalk.hex('#FB5607')('    ✦') + chalk.hex('#FFBE0B')(' AI Coding Agent ') + chalk.hex('#8338EC')('v' + VERSION) + chalk.hex('#3A86FF')('  ·  ') + chalk.hex('#06FFA5')('/help') + chalk.hex('#FF006E')(' for commands ') + chalk.hex('#FB5607')('✦'),
  '',
].join('\n');

// ═══════════════════════════════════════════════════════════════════════════════
// OPTION 2: SUNSET VIBES (Warm gradient)
// Colors: Coral → Orange → Yellow → Gold
// ═══════════════════════════════════════════════════════════════════════════════
export const LOGO_SUNSET = [
  '',
  chalk.hex('#FF4E50')('    ╭──────────────────────────────────────────────────────────╮'),
  chalk.hex('#FF4E50')('    │') + chalk.hex('#F9D423')('  ██████╗ ██╗██████╗  ██████╗ ██╗  ██╗ █████╗ ') + chalk.hex('#FF4E50')('│'),
  chalk.hex('#FF4E50')('    │') + chalk.hex('#F9D423')('  ██╔══██╗██║██╔══██╗██╔════╝ ██║  ██║██╔══██╗') + chalk.hex('#FF4E50')('│'),
  chalk.hex('#FF4E50')('    │') + chalk.hex('#FF6B35')('  ██║  ██║██║██████╔╝██║  ███╗███████║███████║') + chalk.hex('#FF4E50')('│'),
  chalk.hex('#FF4E50')('    │') + chalk.hex('#FF6B35')('  ██║  ██║██║██╔══██╗██║   ██║██╔══██║██╔══██║') + chalk.hex('#FF4E50')('│'),
  chalk.hex('#FF4E50')('    │') + chalk.hex('#FF4E50')('  ██████╔╝██║██║  ██║╚██████╔╝██║  ██║██║  ██║') + chalk.hex('#FF4E50')('│'),
  chalk.hex('#FF4E50')('    │') + chalk.hex('#FF4E50')('  ╚═════╝ ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝') + chalk.hex('#FF4E50')('│'),
  chalk.hex('#FF4E50')('    ╰──────────────────────────────────────────────────────────╯'),
  '',
  chalk.hex('#F9D423')('    ✦') + chalk.hex('#FF6B35')(' AI Coding Agent ') + chalk.hex('#FF4E50')('v' + VERSION) + chalk.hex('#F9D423')('  ·  ') + chalk.hex('#FF6B35')('/help') + chalk.hex('#FF4E50')(' for commands ') + chalk.hex('#F9D423')('✦'),
  '',
].join('\n');

// ═══════════════════════════════════════════════════════════════════════════════
// OPTION 3: OCEAN DEEP (Cool blues & cyans)
// Colors: Deep Blue → Cyan → Mint → Teal
// ═══════════════════════════════════════════════════════════════════════════════
export const LOGO_OCEAN = [
  '',
  chalk.hex('#0061FF')('    ╭──────────────────────────────────────────────────────────╮'),
  chalk.hex('#0061FF')('    │') + chalk.hex('#00C9FF')('  ██████╗ ██╗██████╗  ██████╗ ██╗  ██╗ █████╗ ') + chalk.hex('#0061FF')('│'),
  chalk.hex('#0061FF')('    │') + chalk.hex('#00C9FF')('  ██╔══██╗██║██╔══██╗██╔════╝ ██║  ██║██╔══██╗') + chalk.hex('#0061FF')('│'),
  chalk.hex('#0061FF')('    │') + chalk.hex('#92FE9D')('  ██║  ██║██║██████╔╝██║  ███╗███████║███████║') + chalk.hex('#0061FF')('│'),
  chalk.hex('#0061FF')('    │') + chalk.hex('#92FE9D')('  ██║  ██║██║██╔══██╗██║   ██║██╔══██║██╔══██║') + chalk.hex('#0061FF')('│'),
  chalk.hex('#0061FF')('    │') + chalk.hex('#00D2FF')('  ██████╔╝██║██║  ██║╚██████╔╝██║  ██║██║  ██║') + chalk.hex('#0061FF')('│'),
  chalk.hex('#0061FF')('    │') + chalk.hex('#3A7BD5')('  ╚═════╝ ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝') + chalk.hex('#0061FF')('│'),
  chalk.hex('#0061FF')('    ╰──────────────────────────────────────────────────────────╯'),
  '',
  chalk.hex('#00C9FF')('    ✦') + chalk.hex('#92FE9D')(' AI Coding Agent ') + chalk.hex('#3A7BD5')('v' + VERSION) + chalk.hex('#00C9FF')('  ·  ') + chalk.hex('#92FE9D')('/help') + chalk.hex('#0061FF')(' for commands ') + chalk.hex('#00C9FF')('✦'),
  '',
].join('\n');

// ═══════════════════════════════════════════════════════════════════════════════
// OPTION 4: GALAXY PURPLE (Mystical purples & pinks)
// Colors: Hot Pink → Purple → Indigo → Cyan
// ═══════════════════════════════════════════════════════════════════════════════
export const LOGO_GALAXY = [
  '',
  chalk.hex('#FF00CC')('    ╭──────────────────────────────────────────────────────────╮'),
  chalk.hex('#FF00CC')('    │') + chalk.hex('#AA00FF')('  ██████╗ ██╗██████╗  ██████╗ ██╗  ██╗ █████╗ ') + chalk.hex('#FF00CC')('│'),
  chalk.hex('#FF00CC')('    │') + chalk.hex('#AA00FF')('  ██╔══██╗██║██╔══██╗██╔════╝ ██║  ██║██╔══██╗') + chalk.hex('#FF00CC')('│'),
  chalk.hex('#FF00CC')('    │') + chalk.hex('#333399')('  ██║  ██║██║██████╔╝██║  ███╗███████║███████║') + chalk.hex('#FF00CC')('│'),
  chalk.hex('#FF00CC')('    │') + chalk.hex('#333399')('  ██║  ██║██║██╔══██╗██║   ██║██╔══██║██╔══██║') + chalk.hex('#FF00CC')('│'),
  chalk.hex('#FF00CC')('    │') + chalk.hex('#00CCFF')('  ██████╔╝██║██║  ██║╚██████╔╝██║  ██║██║  ██║') + chalk.hex('#FF00CC')('│'),
  chalk.hex('#FF00CC')('    │') + chalk.hex('#FF00CC')('  ╚═════╝ ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝') + chalk.hex('#FF00CC')('│'),
  chalk.hex('#FF00CC')('    ╰──────────────────────────────────────────────────────────╯'),
  '',
  chalk.hex('#AA00FF')('    ✦') + chalk.hex('#00CCFF')(' AI Coding Agent ') + chalk.hex('#FF00CC')('v' + VERSION) + chalk.hex('#AA00FF')('  ·  ') + chalk.hex('#00CCFF')('/help') + chalk.hex('#FF00CC')(' for commands ') + chalk.hex('#AA00FF')('✦'),
  '',
].join('\n');

// ═══════════════════════════════════════════════════════════════════════════════
// OPTION 5: CYBERPUNK NEON (High contrast neon)
// Colors: Neon Pink → Neon Green → Neon Blue
// ═══════════════════════════════════════════════════════════════════════════════
export const LOGO_CYBERPUNK = [
  '',
  chalk.hex('#FF0055')('    ╭──────────────────────────────────────────────────────────╮'),
  chalk.hex('#FF0055')('    │') + chalk.hex('#00FF99')('  ██████╗ ██╗██████╗  ██████╗ ██╗  ██╗ █████╗ ') + chalk.hex('#FF0055')('│'),
  chalk.hex('#FF0055')('    │') + chalk.hex('#00FF99')('  ██╔══██╗██║██╔══██╗██╔════╝ ██║  ██║██╔══██╗') + chalk.hex('#FF0055')('│'),
  chalk.hex('#FF0055')('    │') + chalk.hex('#00CCFF')('  ██║  ██║██║██████╔╝██║  ███╗███████║███████║') + chalk.hex('#FF0055')('│'),
  chalk.hex('#FF0055')('    │') + chalk.hex('#00CCFF')('  ██║  ██║██║██╔══██╗██║   ██║██╔══██║██╔══██║') + chalk.hex('#FF0055')('│'),
  chalk.hex('#FF0055')('    │') + chalk.hex('#FF0055')('  ██████╔╝██║██║  ██║╚██████╔╝██║  ██║██║  ██║') + chalk.hex('#FF0055')('│'),
  chalk.hex('#FF0055')('    │') + chalk.hex('#FF0055')('  ╚═════╝ ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝') + chalk.hex('#FF0055')('│'),
  chalk.hex('#FF0055')('    ╰──────────────────────────────────────────────────────────╯'),
  '',
  chalk.hex('#00FF99')('    ✦') + chalk.hex('#00CCFF')(' AI Coding Agent ') + chalk.hex('#FF0055')('v' + VERSION) + chalk.hex('#00FF99')('  ·  ') + chalk.hex('#00CCFF')('/help') + chalk.hex('#FF0055')(' for commands ') + chalk.hex('#00FF99')('✦'),
  '',
].join('\n');

// ═══════════════════════════════════════════════════════════════════════════════
// OPTION 6: GOLD LUXURY (Premium gold & amber)
// Colors: Gold → Orange → Deep Gold
// ═══════════════════════════════════════════════════════════════════════════════
export const LOGO_GOLD = [
  '',
  chalk.hex('#FFD700')('    ╭──────────────────────────────────────────────────────────╮'),
  chalk.hex('#FFD700')('    │') + chalk.hex('#FFA500')('  ██████╗ ██╗██████╗  ██████╗ ██╗  ██╗ █████╗ ') + chalk.hex('#FFD700')('│'),
  chalk.hex('#FFD700')('    │') + chalk.hex('#FFA500')('  ██╔══██╗██║██╔══██╗██╔════╝ ██║  ██║██╔══██╗') + chalk.hex('#FFD700')('│'),
  chalk.hex('#FFD700')('    │') + chalk.hex('#FF8C00')('  ██║  ██║██║██████╔╝██║  ███╗███████║███████║') + chalk.hex('#FFD700')('│'),
  chalk.hex('#FFD700')('    │') + chalk.hex('#FF8C00')('  ██║  ██║██║██╔══██╗██║   ██║██╔══██║██╔══██║') + chalk.hex('#FFD700')('│'),
  chalk.hex('#FFD700')('    │') + chalk.hex('#FFD700')('  ██████╔╝██║██║  ██║╚██████╔╝██║  ██║██║  ██║') + chalk.hex('#FFD700')('│'),
  chalk.hex('#FFD700')('    │') + chalk.hex('#B8860B')('  ╚═════╝ ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝') + chalk.hex('#FFD700')('│'),
  chalk.hex('#FFD700')('    ╰──────────────────────────────────────────────────────────╯'),
  '',
  chalk.hex('#FFA500')('    ✦') + chalk.hex('#FF8C00')(' AI Coding Agent ') + chalk.hex('#B8860B')('v' + VERSION) + chalk.hex('#FFA500')('  ·  ') + chalk.hex('#FF8C00')('/help') + chalk.hex('#FFD700')(' for commands ') + chalk.hex('#FFA500')('✦'),
  '',
].join('\n');

// ═══════════════════════════════════════════════════════════════════════════════
// OPTION 7: ICE MATRIX (Cool cyan & white)
// Colors: Cyan → White → Deep Sky Blue
// ═══════════════════════════════════════════════════════════════════════════════
export const LOGO_ICE = [
  '',
  chalk.hex('#00FFFF')('    ╭──────────────────────────────────────────────────────────╮'),
  chalk.hex('#00FFFF')('    │') + chalk.hex('#E0FFFF')('  ██████╗ ██╗██████╗  ██████╗ ██╗  ██╗ █████╗ ') + chalk.hex('#00FFFF')('│'),
  chalk.hex('#00FFFF')('    │') + chalk.hex('#E0FFFF')('  ██╔══██╗██║██╔══██╗██╔════╝ ██║  ██║██╔══██╗') + chalk.hex('#00FFFF')('│'),
  chalk.hex('#00FFFF')('    │') + chalk.hex('#00BFFF')('  ██║  ██║██║██████╔╝██║  ███╗███████║███████║') + chalk.hex('#00FFFF')('│'),
  chalk.hex('#00FFFF')('    │') + chalk.hex('#00BFFF')('  ██║  ██║██║██╔══██╗██║   ██║██╔══██║██╔══██║') + chalk.hex('#00FFFF')('│'),
  chalk.hex('#00FFFF')('    │') + chalk.hex('#00FFFF')('  ██████╔╝██║██║  ██║╚██████╔╝██║  ██║██║  ██║') + chalk.hex('#00FFFF')('│'),
  chalk.hex('#00FFFF')('    │') + chalk.hex('#1E90FF')('  ╚═════╝ ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝') + chalk.hex('#00FFFF')('│'),
  chalk.hex('#00FFFF')('    ╰──────────────────────────────────────────────────────────╯'),
  '',
  chalk.hex('#E0FFFF')('    ✦') + chalk.hex('#00BFFF')(' AI Coding Agent ') + chalk.hex('#1E90FF')('v' + VERSION) + chalk.hex('#E0FFFF')('  ·  ') + chalk.hex('#00BFFF')('/help') + chalk.hex('#00FFFF')(' for commands ') + chalk.hex('#E0FFFF')('✦'),
  '',
].join('\n');

// ═══════════════════════════════════════════════════════════════════════════════
// OPTION 8: SAKURA PINK (Soft pinks)
// Colors: Light Pink → Hot Pink → Deep Pink
// ═══════════════════════════════════════════════════════════════════════════════
export const LOGO_SAKURA = [
  '',
  chalk.hex('#FFB7C5')('    ╭──────────────────────────────────────────────────────────╮'),
  chalk.hex('#FFB7C5')('    │') + chalk.hex('#FF69B4')('  ██████╗ ██╗██████╗  ██████╗ ██╗  ██╗ █████╗ ') + chalk.hex('#FFB7C5')('│'),
  chalk.hex('#FFB7C5')('    │') + chalk.hex('#FF69B4')('  ██╔══██╗██║██╔══██╗██╔════╝ ██║  ██║██╔══██╗') + chalk.hex('#FFB7C5')('│'),
  chalk.hex('#FFB7C5')('    │') + chalk.hex('#FF1493')('  ██║  ██║██║██████╔╝██║  ███╗███████║███████║') + chalk.hex('#FFB7C5')('│'),
  chalk.hex('#FFB7C5')('    │') + chalk.hex('#FF1493')('  ██║  ██║██║██╔══██╗██║   ██║██╔══██║██╔══██║') + chalk.hex('#FFB7C5')('│'),
  chalk.hex('#FFB7C5')('    │') + chalk.hex('#FFB7C5')('  ██████╔╝██║██║  ██║╚██████╔╝██║  ██║██║  ██║') + chalk.hex('#FFB7C5')('│'),
  chalk.hex('#FFB7C5')('    │') + chalk.hex('#C71585')('  ╚═════╝ ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝') + chalk.hex('#FFB7C5')('│'),
  chalk.hex('#FFB7C5')('    ╰──────────────────────────────────────────────────────────╯'),
  '',
  chalk.hex('#FF69B4')('    ✦') + chalk.hex('#FF1493')(' AI Coding Agent ') + chalk.hex('#C71585')('v' + VERSION) + chalk.hex('#FF69B4')('  ·  ') + chalk.hex('#FF1493')('/help') + chalk.hex('#FFB7C5')(' for commands ') + chalk.hex('#FF69B4')('✦'),
  '',
].join('\n');

// ═══════════════════════════════════════════════════════════════════════════════
// COMPACT VERSIONS (for narrow terminals <80 cols)
// ═══════════════════════════════════════════════════════════════════════════════

export const LOGO_COMPACT_COSMIC = [
  '',
  chalk.hex('#FF006E')('  ◆ ') + chalk.hex('#FB5607')('DIR') + chalk.hex('#FFBE0B')('G') + chalk.hex('#8338EC')('H') + chalk.hex('#3A86FF')('A') + chalk.hex('#06FFA5')(' ◆'),
  chalk.hex('#FB5607')('  ✦ ') + chalk.hex('#FFBE0B')('AI Coding Agent ') + chalk.hex('#8338EC')('v' + VERSION) + chalk.hex('#3A86FF')(' ✦'),
  chalk.hex('#06FFA5')('  /help for commands'),
  '',
].join('\n');

export const LOGO_COMPACT_CYBERPUNK = [
  '',
  chalk.hex('#FF0055')('  ◆ ') + chalk.hex('#00FF99')('DIR') + chalk.hex('#00CCFF')('G') + chalk.hex('#FF0055')('H') + chalk.hex('#00FF99')('A') + chalk.hex('#00CCFF')(' ◆'),
  chalk.hex('#00FF99')('  ✦ ') + chalk.hex('#00CCFF')('AI Coding Agent ') + chalk.hex('#FF0055')('v' + VERSION) + chalk.hex('#00FF99')(' ✦'),
  chalk.hex('#00CCFF')('  /help for commands'),
  '',
].join('\n');

export const LOGO_COMPACT_GOLD = [
  '',
  chalk.hex('#FFD700')('  ◆ ') + chalk.hex('#FFA500')('DIR') + chalk.hex('#FF8C00')('G') + chalk.hex('#FFD700')('H') + chalk.hex('#FFA500')('A') + chalk.hex('#FF8C00')(' ◆'),
  chalk.hex('#FFA500')('  ✦ ') + chalk.hex('#FF8C00')('AI Coding Agent ') + chalk.hex('#FFD700')('v' + VERSION) + chalk.hex('#FFA500')(' ✦'),
  chalk.hex('#FFD700')('  /help for commands'),
  '',
].join('\n');

// Export all options for easy switching
export const LOGO_OPTIONS = {
  cosmic: LOGO_COSMIC,
  sunset: LOGO_SUNSET,
  ocean: LOGO_OCEAN,
  galaxy: LOGO_GALAXY,
  cyberpunk: LOGO_CYBERPUNK,
  gold: LOGO_GOLD,
  ice: LOGO_ICE,
  sakura: LOGO_SAKURA,
};

export const LOGO_COMPACT_OPTIONS = {
  cosmic: LOGO_COMPACT_COSMIC,
  cyberpunk: LOGO_COMPACT_CYBERPUNK,
  gold: LOGO_COMPACT_GOLD,
};
