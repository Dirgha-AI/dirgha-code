/// <reference types="node" resolution-mode="require"/>
import { type ChildProcess } from "node:child_process";
export interface Position {
    line: number;
    character: number;
}
export interface Range {
    start: Position;
    end: Position;
}
export interface Location {
    uri: string;
    range: Range;
}
export interface Diagnostic {
    range: Range;
    severity?: number;
    code?: string | number;
    source?: string;
    message: string;
}
export interface SymbolInfo {
    name: string;
    kind: number;
    location: Location;
    containerName?: string;
}
export interface DocumentSymbol {
    name: string;
    detail?: string;
    kind: number;
    range: Range;
    selectionRange: Range;
    children?: DocumentSymbol[];
}
export interface HoverResult {
    contents: {
        language?: string;
        value: string;
    } | {
        language?: string;
        value: string;
    }[] | string;
    range?: Range;
}
export interface ServerCapabilities {
    textDocumentSync?: number | {
        change?: number;
    };
    definitionProvider?: boolean;
    referencesProvider?: boolean;
    hoverProvider?: boolean;
    documentSymbolProvider?: boolean;
    [key: string]: unknown;
}
export declare function symbolKindLabel(kind: number): string;
export interface LspConnection {
    sendRequest<T>(method: string, params?: unknown): Promise<T>;
    sendNotification(method: string, params?: unknown): Promise<void>;
    onNotification(method: string, handler: (params: unknown) => void): void;
    rejectAllPending(reason: string): void;
    dispose(): void;
}
export declare function createLspConnection(proc: ChildProcess): LspConnection;
export interface LspClient {
    serverId: string;
    root: string;
    capabilities: ServerCapabilities;
    openFile(filePath: string): Promise<void>;
    goToDefinition(pos: Position, filePath: string): Promise<Location[]>;
    findReferences(pos: Position, filePath: string): Promise<Location[]>;
    hover(pos: Position, filePath: string): Promise<HoverResult | null>;
    documentSymbols(filePath: string): Promise<(DocumentSymbol | SymbolInfo)[]>;
    getDiagnostics(): Promise<Record<string, Diagnostic[]>>;
    shutdown(): Promise<void>;
}
export declare function createLspClient(serverId: string, command: string, args: string[], root: string, cwd: string): Promise<LspClient>;
