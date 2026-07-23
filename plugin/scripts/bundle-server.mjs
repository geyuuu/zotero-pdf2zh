// 打包前把仓库根目录的 server/ 复制进 addon/server/, 并生成 server-manifest.json,
// 使 server 代码随 XPI 一起分发; 插件首次运行会把它解压到 Zotero 数据目录并自动使用。
// 排除大文件与运行时产物, 保持体积很小(仅几百 KB)。
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(__dirname, "..");
const srcDir = path.resolve(pluginDir, "..", "server"); // 仓库根/server
const destDir = path.join(pluginDir, "addon", "server");
const manifestPath = path.join(pluginDir, "addon", "server-manifest.json");

const require = createRequire(import.meta.url);
const version = require(path.join(pluginDir, "package.json")).version;

// 排除规则(相对 server/ 的路径或名称)
function isExcluded(relPath, name, isDir) {
    if (name === "__pycache__" || name === ".git") return true;
    if (isDir && /venv/i.test(name)) return true; // 任何 *venv* 目录
    if (isDir && (name === "translated" || name === "doc")) return true;
    if (/^README.*\.pdf$/i.test(name)) return true; // 5MB 的 README PDF
    if (name === "bo.mp3") return true; // 二进制提示音, 丢弃以保持全文本解压
    if (name.endsWith(".pyc")) return true;
    return false;
}

async function walk(dir, base, out) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
        const abs = path.join(dir, e.name);
        const rel = base ? `${base}/${e.name}` : e.name;
        if (isExcluded(rel, e.name, e.isDirectory())) continue;
        if (e.isDirectory()) {
            await walk(abs, rel, out);
        } else if (e.isFile()) {
            out.push(rel);
        }
    }
}

async function main() {
    // 校验源存在
    try {
        await fs.access(path.join(srcDir, "server.py"));
    } catch {
        console.error(
            `[bundle-server] 找不到 ${srcDir}/server.py, 跳过内置 server 打包。`,
        );
        // 仍写一个空 manifest, 避免运行时读取报错
        await fs.mkdir(path.dirname(manifestPath), { recursive: true });
        await fs.writeFile(
            manifestPath,
            JSON.stringify({ version, files: [] }, null, 0),
        );
        return;
    }

    // 清理旧的 dest
    await fs.rm(destDir, { recursive: true, force: true });
    await fs.mkdir(destDir, { recursive: true });

    const files = [];
    await walk(srcDir, "", files);
    files.sort();

    for (const rel of files) {
        const from = path.join(srcDir, ...rel.split("/"));
        const to = path.join(destDir, ...rel.split("/"));
        await fs.mkdir(path.dirname(to), { recursive: true });
        await fs.copyFile(from, to);
    }

    await fs.writeFile(
        manifestPath,
        JSON.stringify({ version, files }, null, 0),
    );
    console.log(
        `[bundle-server] 已内置 ${files.length} 个文件到 addon/server/ (version ${version})`,
    );
}

main().catch((e) => {
    console.error("[bundle-server] 失败:", e);
    process.exit(1);
});
