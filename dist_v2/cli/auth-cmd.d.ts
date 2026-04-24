/**
 * `dirgha auth` subcommand group: login (device code), logout, whoami.
 * Uses the integrations/auth.ts client; prints friendly output.
 */
export interface AuthCmdArgs {
    op: 'login' | 'logout' | 'whoami';
    gatewayUrl?: string;
    openBrowser?: boolean;
}
export declare function runAuth(args: AuthCmdArgs): Promise<number>;
