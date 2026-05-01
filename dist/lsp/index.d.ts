import { type LspClient, type Location, type HoverResult, type DocumentSymbol, type SymbolInfo, type Diagnostic } from "./client.js";
declare class LspManager {
    private clients;
    private spawning;
    private broken;
    static instance(): LspManager;
    getClients(filePath: string): Promise<LspClient[]>;
    hasClients(filePath: string): Promise<boolean>;
    shutdown(): Promise<void>;
    goToDefinition(filePath: string, line: number, character: number): Promise<Location[]>;
    findReferences(filePath: string, line: number, character: number): Promise<Location[]>;
    hover(filePath: string, line: number, character: number): Promise<HoverResult | null>;
    documentSymbols(filePath: string): Promise<(DocumentSymbol | SymbolInfo)[]>;
    getDiagnostics(filePath?: string): Promise<Record<string, Diagnostic[]>>;
    status(): {
        id: string;
        root: string;
        connected: boolean;
    }[];
}
export declare function getLspManager(): LspManager;
export { LspManager };
export type { HoverResult, Location, DocumentSymbol, SymbolInfo, Diagnostic, Position, } from "./client.js";
export { symbolKindLabel } from "./client.js";
export { KNOWN_SERVERS, detectInstalledServers, getServerForFile, type LanguageServerInfo, } from "./detector.js";
