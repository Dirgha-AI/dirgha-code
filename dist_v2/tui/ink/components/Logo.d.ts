/**
 * Logo: single-item banner shown once at startup.
 *
 * Rendered inside <Static> by App so it never re-renders and never
 * participates in scroll-jitter. Width-adaptive: wide ASCII block on
 * terminals >= 60 cols, compact one-liner otherwise.
 */
import * as React from 'react';
export interface LogoProps {
    version: string;
}
export declare function Logo({ version }: LogoProps): React.JSX.Element;
