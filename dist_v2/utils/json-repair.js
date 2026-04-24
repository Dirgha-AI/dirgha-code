/**
 * Heuristic repair for partial or malformed JSON produced by streaming
 * model output. Invoked when a JSON.parse fails on a tool-call argument
 * blob or a chunked response. Best-effort — returns {} on total failure
 * so callers never throw from a cosmetically bad payload.
 */
export function repairJSON(raw) {
    if (!raw || !raw.trim())
        return {};
    let trimmed = raw.trim();
    try {
        return JSON.parse(trimmed);
    }
    catch {
        /* proceed to repairs */
    }
    const quoteCount = (trimmed.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) {
        trimmed += '"';
    }
    trimmed = trimmed.replace(/,\s*([}\]])/g, '$1');
    const stack = [];
    for (let i = 0; i < trimmed.length; i++) {
        const char = trimmed[i];
        if (char === '{')
            stack.push('}');
        else if (char === '[')
            stack.push(']');
        else if (char === '}' || char === ']') {
            if (stack.length > 0 && stack[stack.length - 1] === char) {
                stack.pop();
            }
        }
    }
    while (stack.length > 0) {
        trimmed += stack.pop();
    }
    try {
        return JSON.parse(trimmed);
    }
    catch {
        return {};
    }
}
//# sourceMappingURL=json-repair.js.map