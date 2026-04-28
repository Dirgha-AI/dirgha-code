/**
 * Skill runtime. Takes the matched skill set and renders them into a
 * single user-role message that precedes the live user prompt. Skills
 * are always injected as user content (not system) so that the provider
 * cache boundary sits above them and per-turn changes do not invalidate
 * the parent cache entry.
 */
export function injectSkills(messages, skills, opts = {}) {
    if (skills.length === 0)
        return messages;
    const header = opts.header
        ?? `The following skills are active for this turn. Consult them as procedural guidance.`;
    const body = [header, ''];
    for (const skill of skills) {
        body.push(renderSkill(skill));
        body.push('');
    }
    const injection = {
        role: 'user',
        content: [{ type: 'text', text: body.join('\n').trimEnd() }],
    };
    const out = [];
    let injected = false;
    for (const msg of messages) {
        if (!injected && msg.role === 'user') {
            out.push(injection);
            injected = true;
        }
        out.push(msg);
    }
    if (!injected)
        out.push(injection);
    return out;
}
function renderSkill(skill) {
    const header = `<skill name="${skill.meta.name}"${skill.meta.version ? ` version="${skill.meta.version}"` : ''} source="${skill.source}">`;
    const footer = '</skill>';
    return `${header}\n${skill.body}\n${footer}`;
}
//# sourceMappingURL=runtime.js.map