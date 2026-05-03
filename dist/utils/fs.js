import { resolve, sep } from "node:path";
export function isValidCwdPath(cwd, relativePath) {
    const resolved = resolve(cwd, relativePath);
    const cwdNorm = cwd.endsWith(sep) ? cwd : cwd + sep;
    if (!resolved.startsWith(cwdNorm) && resolved !== cwd) {
        return { valid: false, error: `path escapes workspace: ${relativePath}` };
    }
    return { valid: true, resolved, cwdNorm };
}
export function decodeLiteralUnicodeEscapes(s) {
    return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => {
        const cp = parseInt(hex, 16);
        if ((cp >= 0x20 && cp <= 0x7e) ||
            cp === 0x0a ||
            cp === 0x0d ||
            cp === 0x09) {
            return String.fromCodePoint(cp);
        }
        return _;
    });
}
export function isBinary(buf) {
    const sample = buf.subarray(0, Math.min(buf.length, 8192));
    if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe)
        return true;
    if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff)
        return true;
    let nonPrintable = 0;
    for (const byte of sample) {
        if (byte === 0)
            return true;
        if (byte < 0x09 || (byte > 0x0d && byte < 0x20))
            nonPrintable++;
    }
    return sample.length > 0 && nonPrintable / sample.length > 0.3;
}
//# sourceMappingURL=fs.js.map