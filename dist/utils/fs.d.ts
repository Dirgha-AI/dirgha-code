export declare function isValidCwdPath(cwd: string, relativePath: string, opts?: {
    allowOutside?: boolean;
}): {
    valid: false;
    error: string;
} | {
    valid: true;
    resolved: string;
    cwdNorm: string;
};
export declare function decodeLiteralUnicodeEscapes(s: string): string;
export declare function isBinary(buf: Buffer): boolean;
