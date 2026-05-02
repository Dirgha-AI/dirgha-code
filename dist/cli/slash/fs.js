import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { rm, mkdir, access } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
class MountManager {
    mounts = [];
    storePath;
    constructor() {
        this.storePath = join(homedir(), ".dirgha", "mounts.json");
        this.load();
    }
    load() {
        try {
            if (existsSync(this.storePath)) {
                const data = JSON.parse(readFileSync(this.storePath, "utf8"));
                this.mounts = Array.isArray(data) ? data : [];
            }
        }
        catch {
            /* fresh start */
        }
    }
    save() {
        try {
            const dir = join(homedir(), ".dirgha");
            try {
                mkdirSync(dir, { recursive: true });
            }
            catch {
                /* exists */
            }
            writeFileSync(this.storePath, JSON.stringify(this.mounts, null, 2), "utf8");
        }
        catch {
            /* ignore */
        }
    }
    async mount(type, path) {
        const existing = this.mounts.find((m) => m.path === path);
        if (existing)
            return `Already mounted: ${existing.type} at ${path}`;
        try {
            await mkdir(path, { recursive: true });
            await access(path);
        }
        catch {
            throw new Error(`Cannot access mount point: ${path}`);
        }
        this.mounts.push({ type, path, createdAt: new Date().toISOString() });
        this.save();
        return `Mounted ${type} at ${path}`;
    }
    async unmount(mountPoint) {
        const idx = this.mounts.findIndex((m) => m.path === mountPoint);
        if (idx < 0)
            return false;
        this.mounts.splice(idx, 1);
        this.save();
        return true;
    }
    list() {
        return [...this.mounts];
    }
    async cleanup() {
        for (const m of this.mounts) {
            try {
                await rm(m.path, { recursive: true, force: true });
            }
            catch {
                /* ignore */
            }
        }
        this.mounts = [];
        this.save();
    }
}
const mountManager = new MountManager();
export const fsCommand = {
    name: "fs",
    description: "Filesystem mount management: /fs mount | /fs unmount | /fs list",
    async execute(args, _ctx) {
        const sub = args[0];
        if (!sub || sub === "help") {
            return [
                "Filesystem Commands:",
                "  /fs mount <type> <path>  Mount filesystem (memory, s3, r2, gdrive)",
                "  /fs unmount <path>       Unmount filesystem",
                "  /fs list                 List active mounts",
                "",
                "  Examples:",
                "  /fs mount memory /tmp/workspace",
                "  /fs mount s3 /s3-data",
                "",
            ].join("\n");
        }
        if (sub === "mount") {
            const type = args[1];
            const mountPoint = args[2];
            if (!type || !mountPoint) {
                return [
                    "Usage: /fs mount <type> <path>",
                    "  Types: memory, s3, r2, gdrive",
                    "  Example: /fs mount memory /tmp/workspace",
                ].join("\n");
            }
            const validTypes = ["memory", "s3", "r2", "gdrive"];
            if (!validTypes.includes(type)) {
                return `Unknown mount type: ${type}. Valid types: ${validTypes.join(", ")}`;
            }
            try {
                if (type === "s3")
                    return "S3 mount requires bucket configuration. Use /fs mount s3 <bucket> <region>";
                if (type === "r2")
                    return "R2 mount requires bucket configuration";
                const result = await mountManager.mount(type, mountPoint);
                return result;
            }
            catch (err) {
                return `Mount failed: ${err instanceof Error ? err.message : String(err)}`;
            }
        }
        if (sub === "unmount") {
            const mountPoint = args[1];
            if (!mountPoint)
                return "Usage: /fs unmount <path>";
            const success = await mountManager.unmount(mountPoint);
            return success
                ? `Unmounted ${mountPoint}`
                : `No mount found at ${mountPoint}`;
        }
        if (sub === "list") {
            const mounts = mountManager.list();
            if (mounts.length === 0)
                return "No active filesystem mounts.";
            return [
                "Filesystem Mounts:",
                ...mounts.map((m) => `  ${m.type.padEnd(10)} ${m.path}  (${m.createdAt})`),
            ].join("\n");
        }
        return `Unknown subcommand "${sub}". Use /fs for help.`;
    },
};
//# sourceMappingURL=fs.js.map