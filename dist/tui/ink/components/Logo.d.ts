/**
 * Logo: single-item banner shown once at startup.
 *
 * Width-adaptive: wide ASCII block on terminals >= 60 cols, compact
 * one-liner otherwise. Default colour scheme is the violet-storm
 * gradient from the v2 origin commit (28f2bc3) — kept fixed across
 * themes because the brand wordmark should read the same regardless
 * of which palette the user prefers for chrome. Themes that ship
 * their own logo gradient (cosmic, ember, sakura, …) override below.
 *
 * Two render paths:
 *   - `Logo` React component — kept for tests / non-Ink callers that
 *     still mount the component directly.
 *   - `renderLogoString(themeName, version, cols)` — emits the same
 *     content as a plain ANSI-coloured string. The Ink entry point
 *     uses this to print the banner BEFORE Ink mounts, so the logo
 *     lives in terminal scrollback and Ink never re-emits it on
 *     viewport overflow. (`use-flicker-detector.ts` already warns
 *     when content height > terminal rows, which is exactly the
 *     condition that triggers Ink's `clearTerminal + fullStaticOutput
 *     + output` path at node_modules/ink/build/ink.js:121 — repaints
 *     the whole `<Static>` history every overflow frame and shows up
 *     as rapid logo flicker on small terminals.)
 */
import * as React from 'react';
export interface LogoProps {
    version: string;
}
/**
 * Pure string version of the logo, mirroring the React layout one-for-one.
 * Use this when you want to emit the banner via process.stdout.write()
 * outside Ink's render tree.
 */
export declare function renderLogoString(themeName: string | undefined, version: string, cols: number): string;
export declare function Logo({ version }: LogoProps): React.JSX.Element;
