/**
 * Logo: single-item banner shown once at startup.
 *
 * Width-adaptive: wide ASCII block on terminals >= 60 cols, compact
 * one-liner otherwise. Default colour scheme is the violet-storm
 * gradient from the v2 origin commit (28f2bc3) — kept fixed across
 * themes because the brand wordmark should read the same regardless
 * of which palette the user prefers for chrome. Themes that ship
 * their own logo gradient (cosmic, ember, sakura, …) override below.
 */
import * as React from 'react';
export interface LogoProps {
    version: string;
}
export declare function Logo({ version }: LogoProps): React.JSX.Element;
