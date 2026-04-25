#!/usr/bin/env node
/** Preview all logo variations in your terminal */
import chalk from 'chalk';

const VERSION = '2.0.0';

console.log(chalk.bold('\n═══════════════════════════════════════════════════════════════'));
console.log(chalk.bold('  DIRGHA CLI LOGO COLOR OPTIONS'));
console.log(chalk.bold('═══════════════════════════════════════════════════════════════\n'));

// Option 1: COSMIC RAINBOW
console.log(chalk.bold.bgMagenta(' OPTION 1: COSMIC RAINBOW ') + chalk.reset());
console.log(chalk.hex('#FF006E')('    ╭──────────────────────────────────────────────────────────╮'));
console.log(chalk.hex('#FF006E')('    │') + chalk.hex('#FB5607')('  ██████╗ ██╗██████╗  ██████╗ ██╗  ██╗ █████╗ ') + chalk.hex('#FF006E')('│'));
console.log(chalk.hex('#FF006E')('    │') + chalk.hex('#FFBE0B')('  ██╔══██╗██║██╔══██╗██╔════╝ ██║  ██║██╔══██╗') + chalk.hex('#FF006E')('│'));
console.log(chalk.hex('#FF006E')('    │') + chalk.hex('#8338EC')('  ██║  ██║██║██████╔╝██║  ███╗███████║███████║') + chalk.hex('#FF006E')('│'));
console.log(chalk.hex('#FF006E')('    │') + chalk.hex('#3A86FF')('  ██║  ██║██║██╔══██╗██║   ██║██╔══██║██╔══██║') + chalk.hex('#FF006E')('│'));
console.log(chalk.hex('#FF006E')('    │') + chalk.hex('#06FFA5')('  ██████╔╝██║██║  ██║╚██████╔╝██║  ██║██║  ██║') + chalk.hex('#FF006E')('│'));
console.log(chalk.hex('#FF006E')('    │') + chalk.hex('#FF006E')('  ╚═════╝ ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝') + chalk.hex('#FF006E')('│'));
console.log(chalk.hex('#FF006E')('    ╰──────────────────────────────────────────────────────────╯'));
console.log(chalk.hex('#FB5607')('    ✦') + chalk.hex('#FFBE0B')(' AI Coding Agent ') + chalk.hex('#8338EC')('v' + VERSION) + chalk.hex('#3A86FF')('  ·  ') + chalk.hex('#06FFA5')('/help') + chalk.hex('#FF006E')(' for commands ') + chalk.hex('#FB5607')('✦'));
console.log(chalk.gray('    Colors: Pink→Orange→Yellow→Purple→Blue→Green\n'));

// Option 2: SUNSET
console.log(chalk.bold.bgRed(' OPTION 2: SUNSET VIBES ') + chalk.reset());
console.log(chalk.hex('#FF4E50')('    ╭──────────────────────────────────────────────────────────╮'));
console.log(chalk.hex('#FF4E50')('    │') + chalk.hex('#F9D423')('  ██████╗ ██╗██████╗  ██████╗ ██╗  ██╗ █████╗ ') + chalk.hex('#FF4E50')('│'));
console.log(chalk.hex('#FF4E50')('    │') + chalk.hex('#F9D423')('  ██╔══██╗██║██╔══██╗██╔════╝ ██║  ██║██╔══██╗') + chalk.hex('#FF4E50')('│'));
console.log(chalk.hex('#FF4E50')('    │') + chalk.hex('#FF6B35')('  ██║  ██║██║██████╔╝██║  ███╗███████║███████║') + chalk.hex('#FF4E50')('│'));
console.log(chalk.hex('#FF4E50')('    │') + chalk.hex('#FF6B35')('  ██║  ██║██║██╔══██╗██║   ██║██╔══██║██╔══██║') + chalk.hex('#FF4E50')('│'));
console.log(chalk.hex('#FF4E50')('    │') + chalk.hex('#FF4E50')('  ██████╔╝██║██║  ██║╚██████╔╝██║  ██║██║  ██║') + chalk.hex('#FF4E50')('│'));
console.log(chalk.hex('#FF4E50')('    │') + chalk.hex('#FF4E50')('  ╚═════╝ ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝') + chalk.hex('#FF4E50')('│'));
console.log(chalk.hex('#FF4E50')('    ╰──────────────────────────────────────────────────────────╯'));
console.log(chalk.hex('#F9D423')('    ✦ Warm coral, yellow, orange gradient\n'));

// Option 3: OCEAN
console.log(chalk.bold.bgBlue(' OPTION 3: OCEAN DEEP ') + chalk.reset());
console.log(chalk.hex('#0061FF')('    ╭──────────────────────────────────────────────────────────╮'));
console.log(chalk.hex('#0061FF')('    │') + chalk.hex('#00C9FF')('  ██████╗ ██╗██████╗  ██████╗ ██╗  ██╗ █████╗ ') + chalk.hex('#0061FF')('│'));
console.log(chalk.hex('#0061FF')('    │') + chalk.hex('#00C9FF')('  ██╔══██╗██║██╔══██╗██╔════╝ ██║  ██║██╔══██╗') + chalk.hex('#0061FF')('│'));
console.log(chalk.hex('#0061FF')('    │') + chalk.hex('#92FE9D')('  ██║  ██║██║██████╔╝██║  ███╗███████║███████║') + chalk.hex('#0061FF')('│'));
console.log(chalk.hex('#0061FF')('    │') + chalk.hex('#92FE9D')('  ██║  ██║██║██╔══██╗██║   ██║██╔══██║██╔══██║') + chalk.hex('#0061FF')('│'));
console.log(chalk.hex('#0061FF')('    │') + chalk.hex('#00D2FF')('  ██████╔╝██║██║  ██║╚██████╔╝██║  ██║██║  ██║') + chalk.hex('#0061FF')('│'));
console.log(chalk.hex('#0061FF')('    │') + chalk.hex('#3A7BD5')('  ╚═════╝ ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝') + chalk.hex('#0061FF')('│'));
console.log(chalk.hex('#0061FF')('    ╰──────────────────────────────────────────────────────────╯'));
console.log(chalk.hex('#00C9FF')('    ✦ Calming blue, cyan, mint gradient\n'));

// Option 4: GALAXY
console.log(chalk.bold.bgMagenta(' OPTION 4: GALAXY PURPLE ') + chalk.reset());
console.log(chalk.hex('#FF00CC')('    ╭──────────────────────────────────────────────────────────╮'));
console.log(chalk.hex('#FF00CC')('    │') + chalk.hex('#AA00FF')('  ██████╗ ██╗██████╗  ██████╗ ██╗  ██╗ █████╗ ') + chalk.hex('#FF00CC')('│'));
console.log(chalk.hex('#FF00CC')('    │') + chalk.hex('#AA00FF')('  ██╔══██╗██║██╔══██╗██╔════╝ ██║  ██║██╔══██╗') + chalk.hex('#FF00CC')('│'));
console.log(chalk.hex('#FF00CC')('    │') + chalk.hex('#333399')('  ██║  ██║██║██████╔╝██║  ███╗███████║███████║') + chalk.hex('#FF00CC')('│'));
console.log(chalk.hex('#FF00CC')('    │') + chalk.hex('#333399')('  ██║  ██║██║██╔══██╗██║   ██║██╔══██║██╔══██║') + chalk.hex('#FF00CC')('│'));
console.log(chalk.hex('#FF00CC')('    │') + chalk.hex('#00CCFF')('  ██████╔╝██║██║  ██║╚██████╔╝██║  ██║██║  ██║') + chalk.hex('#FF00CC')('│'));
console.log(chalk.hex('#FF00CC')('    │') + chalk.hex('#FF00CC')('  ╚═════╝ ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝') + chalk.hex('#FF00CC')('│'));
console.log(chalk.hex('#FF00CC')('    ╰──────────────────────────────────────────────────────────╯'));
console.log(chalk.hex('#AA00FF')('    ✦ Mystical pink, purple, indigo, cyan\n'));

// Option 5: CYBERPUNK
console.log(chalk.bold.bgBlack(' OPTION 5: CYBERPUNK NEON ') + chalk.reset());
console.log(chalk.hex('#FF0055')('    ╭──────────────────────────────────────────────────────────╮'));
console.log(chalk.hex('#FF0055')('    │') + chalk.hex('#00FF99')('  ██████╗ ██╗██████╗  ██████╗ ██╗  ██╗ █████╗ ') + chalk.hex('#FF0055')('│'));
console.log(chalk.hex('#FF0055')('    │') + chalk.hex('#00FF99')('  ██╔══██╗██║██╔══██╗██╔════╝ ██║  ██║██╔══██╗') + chalk.hex('#FF0055')('│'));
console.log(chalk.hex('#FF0055')('    │') + chalk.hex('#00CCFF')('  ██║  ██║██║██████╔╝██║  ███╗███████║███████║') + chalk.hex('#FF0055')('│'));
console.log(chalk.hex('#FF0055')('    │') + chalk.hex('#00CCFF')('  ██║  ██║██║██╔══██╗██║   ██║██╔══██║██╔══██║') + chalk.hex('#FF0055')('│'));
console.log(chalk.hex('#FF0055')('    │') + chalk.hex('#FF0055')('  ██████╔╝██║██║  ██║╚██████╔╝██║  ██║██║  ██║') + chalk.hex('#FF0055')('│'));
console.log(chalk.hex('#FF0055')('    │') + chalk.hex('#FF0055')('  ╚═════╝ ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝') + chalk.hex('#FF0055')('│'));
console.log(chalk.hex('#FF0055')('    ╰──────────────────────────────────────────────────────────╯'));
console.log(chalk.hex('#00FF99')('    ✦ Neon pink, green, blue - high contrast\n'));

// Option 6: GOLD
console.log(chalk.bold.bgYellow.black(' OPTION 6: GOLD LUXURY ') + chalk.reset());
console.log(chalk.hex('#FFD700')('    ╭──────────────────────────────────────────────────────────╮'));
console.log(chalk.hex('#FFD700')('    │') + chalk.hex('#FFA500')('  ██████╗ ██╗██████╗  ██████╗ ██╗  ██╗ █████╗ ') + chalk.hex('#FFD700')('│'));
console.log(chalk.hex('#FFD700')('    │') + chalk.hex('#FFA500')('  ██╔══██╗██║██╔══██╗██╔════╝ ██║  ██║██╔══██╗') + chalk.hex('#FFD700')('│'));
console.log(chalk.hex('#FFD700')('    │') + chalk.hex('#FF8C00')('  ██║  ██║██║██████╔╝██║  ███╗███████║███████║') + chalk.hex('#FFD700')('│'));
console.log(chalk.hex('#FFD700')('    │') + chalk.hex('#FF8C00')('  ██║  ██║██║██╔══██╗██║   ██║██╔══██║██╔══██║') + chalk.hex('#FFD700')('│'));
console.log(chalk.hex('#FFD700')('    │') + chalk.hex('#FFD700')('  ██████╔╝██║██║  ██║╚██████╔╝██║  ██║██║  ██║') + chalk.hex('#FFD700')('│'));
console.log(chalk.hex('#FFD700')('    │') + chalk.hex('#B8860B')('  ╚═════╝ ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝') + chalk.hex('#FFD700')('│'));
console.log(chalk.hex('#FFD700')('    ╰──────────────────────────────────────────────────────────╯'));
console.log(chalk.hex('#FFA500')('    ✦ Premium gold, amber, deep gold\n'));

// Option 7: ICE
console.log(chalk.bold.bgCyan.black(' OPTION 7: ICE MATRIX ') + chalk.reset());
console.log(chalk.hex('#00FFFF')('    ╭──────────────────────────────────────────────────────────╮'));
console.log(chalk.hex('#00FFFF')('    │') + chalk.hex('#E0FFFF')('  ██████╗ ██╗██████╗  ██████╗ ██╗  ██╗ █████╗ ') + chalk.hex('#00FFFF')('│'));
console.log(chalk.hex('#00FFFF')('    │') + chalk.hex('#E0FFFF')('  ██╔══██╗██║██╔══██╗██╔════╝ ██║  ██║██╔══██╗') + chalk.hex('#00FFFF')('│'));
console.log(chalk.hex('#00FFFF')('    │') + chalk.hex('#00BFFF')('  ██║  ██║██║██████╔╝██║  ███╗███████║███████║') + chalk.hex('#00FFFF')('│'));
console.log(chalk.hex('#00FFFF')('    │') + chalk.hex('#00BFFF')('  ██║  ██║██║██╔══██╗██║   ██║██╔══██║██╔══██║') + chalk.hex('#00FFFF')('│'));
console.log(chalk.hex('#00FFFF')('    │') + chalk.hex('#00FFFF')('  ██████╔╝██║██║  ██║╚██████╔╝██║  ██║██║  ██║') + chalk.hex('#00FFFF')('│'));
console.log(chalk.hex('#00FFFF')('    │') + chalk.hex('#1E90FF')('  ╚═════╝ ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝') + chalk.hex('#00FFFF')('│'));
console.log(chalk.hex('#00FFFF')('    ╰──────────────────────────────────────────────────────────╯'));
console.log(chalk.hex('#E0FFFF')('    ✦ Cool cyan, white, deep sky blue\n'));

// Option 8: SAKURA
console.log(chalk.bold.bgMagenta(' OPTION 8: SAKURA PINK ') + chalk.reset());
console.log(chalk.hex('#FFB7C5')('    ╭──────────────────────────────────────────────────────────╮'));
console.log(chalk.hex('#FFB7C5')('    │') + chalk.hex('#FF69B4')('  ██████╗ ██╗██████╗  ██████╗ ██╗  ██╗ █████╗ ') + chalk.hex('#FFB7C5')('│'));
console.log(chalk.hex('#FFB7C5')('    │') + chalk.hex('#FF69B4')('  ██╔══██╗██║██╔══██╗██╔════╝ ██║  ██║██╔══██╗') + chalk.hex('#FFB7C5')('│'));
console.log(chalk.hex('#FFB7C5')('    │') + chalk.hex('#FF1493')('  ██║  ██║██║██████╔╝██║  ███╗███████║███████║') + chalk.hex('#FFB7C5')('│'));
console.log(chalk.hex('#FFB7C5')('    │') + chalk.hex('#FF1493')('  ██║  ██║██║██╔══██╗██║   ██║██╔══██║██╔══██║') + chalk.hex('#FFB7C5')('│'));
console.log(chalk.hex('#FFB7C5')('    │') + chalk.hex('#FFB7C5')('  ██████╔╝██║██║  ██║╚██████╔╝██║  ██║██║  ██║') + chalk.hex('#FFB7C5')('│'));
console.log(chalk.hex('#FFB7C5')('    │') + chalk.hex('#C71585')('  ╚═════╝ ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝') + chalk.hex('#FFB7C5')('│'));
console.log(chalk.hex('#FFB7C5')('    ╰──────────────────────────────────────────────────────────╯'));
console.log(chalk.hex('#FF69B4')('    ✦ Soft sakura, hot pink, deep pink\n'));

console.log(chalk.bold('═══════════════════════════════════════════════════════════════'));
console.log(chalk.bold('  RECOMMENDATION:'));
console.log(chalk('  • Option 1 (Cosmic) - Most popular, full spectrum energy'));
console.log(chalk('  • Option 5 (Cyberpunk) - Trendy neon, great for dev tools'));
console.log(chalk('  • Option 6 (Gold) - Premium feel, stands out'));
console.log(chalk.bold('═══════════════════════════════════════════════════════════════\n'));
