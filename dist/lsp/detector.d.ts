export interface LanguageServerInfo {
    id: string;
    name: string;
    extensions: string[];
    command: string;
    args: string[];
    detect(): boolean;
    findRoot(filePath: string): string | undefined;
}
export declare const KNOWN_SERVERS: LanguageServerInfo[];
export declare function getServerForFile(filePath: string): LanguageServerInfo | undefined;
export declare function detectInstalledServers(): LanguageServerInfo[];
export declare function getLspRoot(filePath: string, server: LanguageServerInfo): string | undefined;
