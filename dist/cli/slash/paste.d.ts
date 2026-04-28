/**
 * /paste — pull the OS clipboard's image (or text) into the next user
 * turn. Closes Gap C from docs/audit/2026-04-28-cursor-bolt-parity.md.
 *
 * Most modern terminals (kitty, iTerm2, WezTerm) handle image paste via
 * OSC 52 escapes that arrive as one big keypress. Ink's input parser
 * treats them as garbled text. Until we add a real OSC 52 handler in
 * the input loop, /paste is the first-class fallback that works on
 * every terminal: it shells out to the platform clipboard tool to
 * retrieve the image bytes.
 *
 * On match: writes the image to a temp file, returns a short note
 * pointing the user at the path. The next user turn can then reference
 * the path (the multimodal handler picks up image_url:// content).
 *
 * On no clipboard tool found: returns a hint listing the supported
 * tools so the user knows what to install.
 */
import type { SlashCommand } from './types.js';
export declare const pasteCommand: SlashCommand;
