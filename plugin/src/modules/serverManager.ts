import axios from "axios";
import { getPref } from "../utils/prefs";
import { ServerStatus, LaunchSpec } from "./pdf2zhTypes";

// ============================================================================
// Mozilla Subprocess 的最小类型声明(zotero-types 已声明全局 ChromeUtils 等,
// 但 Subprocess 模块本身无精确类型, 这里给出使用到的最小形状并在取用时 as any)
// ============================================================================
interface SubprocessPipe {
    readString(): Promise<string | null>;
    write?(data: string): Promise<unknown>;
    close?(): Promise<unknown>;
}
interface SubprocessProc {
    pid: number;
    stdin?: SubprocessPipe;
    stdout: SubprocessPipe;
    stderr: SubprocessPipe;
    wait(): Promise<{ exitCode: number }>;
    kill(timeout?: number): Promise<{ exitCode: number }>;
}
interface SubprocessModule {
    call(options: {
        command: string;
        arguments?: string[];
        environment?: Record<string, string>;
        environmentAppend?: boolean;
        workdir?: string;
        stdin?: string;
        stdout?: string;
        stderr?: string;
    }): Promise<SubprocessProc>;
    pathSearch(command: string): string;
}

// 载入 Subprocess 模块: Zotero 7/8 (Firefox 115+) 用 .sys.mjs, 旧版回退 .jsm
function loadSubprocess(): SubprocessModule {
    const CU = ChromeUtils as any;
    try {
        return CU.importESModule("resource://gre/modules/Subprocess.sys.mjs")
            .Subprocess as SubprocessModule;
    } catch (e) {
        try {
            return CU.import("resource://gre/modules/Subprocess.jsm")
                .Subprocess as SubprocessModule;
        } catch (e2) {
            throw new Error(
                "无法加载 Subprocess 模块(需要 Zotero 7 及以上): " + String(e2),
            );
        }
    }
}

// 带类型标记的启动错误, 便于上层区分给出可操作提示
class LaunchError extends Error {
    constructor(
        public code:
            | "no-server-dir"
            | "no-server-py"
            | "no-uv"
            | "no-custom-command",
        message: string,
    ) {
        super(message);
        this.name = "LaunchError";
    }
}

export class ServerManager {
    private static instance: ServerManager;
    static getInstance(): ServerManager {
        if (!ServerManager.instance) {
            ServerManager.instance = new ServerManager();
        }
        return ServerManager.instance;
    }

    // ---------- 对外状态 ----------
    private get state() {
        return addon.data.server;
    }
    getStatus(): ServerStatus {
        return this.state.status;
    }

    // 用系统默认浏览器打开 server 自带的实时进度页(SSE 进度条+历史+下载)
    openProgressPage(): void {
        let base =
            getPref("new_serverip")?.toString() || "http://localhost:8890";
        base = base.replace(/\/+$/, ""); // 去掉末尾斜杠
        try {
            Zotero.launchURL(base + "/");
        } catch (e) {
            ztoolkit.log("[serverManager] 打开进度页失败:", e);
            ztoolkit.getGlobal("alert")(
                "无法打开进度页, 请手动在浏览器访问:\n" + base + "/",
            );
        }
    }
    // 我们启动的进程是否还活着
    isRunning(): boolean {
        return !!this.state.proc && this.state.exitCode === null;
    }

    // ========================================================================
    // 惰性入口: 翻译前调用。绝不抛异常; 返回 true 表示此刻配置地址有服务可达。
    // ========================================================================
    async ensureServerRunning(): Promise<boolean> {
        try {
            const { host } = this.parseServerUrl();

            // 1. 远程地址: 只做健康检查, 绝不 spawn
            if (!this.isLocalHost(host)) {
                const v = await this.checkHealth(3000);
                this.state.status = v ? "running-external" : "error";
                return !!v;
            }

            // 2. 并发去重: 已有启动流程则复用
            if (this.state.startPromise) {
                return await this.state.startPromise;
            }

            // 3. 我们的进程仍活着且健康 -> 直接用
            if (this.isRunning()) {
                if (await this.checkHealth(3000)) return true;
            }

            // 4. 已有服务(可能是用户手动起的/上次残留) -> 复用, 不标记 startedByUs
            const existing = await this.checkHealth(3000);
            if (existing) {
                if (!this.state.startedByUs) {
                    this.state.status = "running-external";
                }
                return true;
            }

            // 5. 未开启自动启动 -> 回退手动模式
            if (!this.getBool("autoStartServer", true)) {
                this.state.status = "stopped";
                return false;
            }

            // 6. 启动
            this.state.startPromise = this.doStart();
            try {
                return await this.state.startPromise;
            } finally {
                this.state.startPromise = null;
            }
        } catch (e) {
            ztoolkit.log("[serverManager] ensureServerRunning 异常:", e);
            this.state.status = "error";
            return false;
        }
    }

    // ========================================================================
    // 偏好页"启动服务"按钮: 硬失败时抛出(便于按钮反馈)
    // ========================================================================
    async startServer(): Promise<void> {
        const { host } = this.parseServerUrl();
        if (!this.isLocalHost(host)) {
            throw new Error(
                "当前 Server IP 指向远程地址, 无法本地启动。仅支持 localhost/127.0.0.1。",
            );
        }
        if (await this.checkHealth(3000)) {
            if (!this.state.startedByUs) this.state.status = "running-external";
            return; // 已在运行
        }
        if (this.state.startPromise) {
            await this.state.startPromise;
            return;
        }
        this.state.startPromise = this.doStart(/* throwOnError */ true);
        try {
            const ok = await this.state.startPromise;
            if (!ok) throw new Error("本地服务启动失败, 请查看日志。");
        } finally {
            this.state.startPromise = null;
        }
    }

    // ========================================================================
    // 停止服务: 幂等, 仅 kill 我们启动的进程
    // ========================================================================
    async stopServer(): Promise<void> {
        const s = this.state;
        if (!s.startedByUs || !s.proc) {
            s.proc = null;
            return;
        }
        try {
            await (s.proc as SubprocessProc).kill(5000);
        } catch (e) {
            ztoolkit.log("[serverManager] kill 失败:", e);
        }
        s.proc = null;
        s.startedByUs = false;
        s.status = "stopped";
        s.exitCode = null;
    }

    // ========================================================================
    // 实际启动流程
    // ========================================================================
    private async doStart(throwOnError = false): Promise<boolean> {
        this.state.status = "starting";
        const progress = new ztoolkit.ProgressWindow("PDF2zh 本地服务", {
            closeOnClick: false,
            closeTime: -1,
        }).createLine({
            text: "正在启动本地翻译服务(首次启动需下载依赖, 请耐心等待)…",
            type: "default",
            progress: 5,
        });
        progress.show();

        // 1. 构建启动命令
        let spec: LaunchSpec;
        try {
            spec = await this.buildLaunchSpec();
        } catch (e) {
            progress.changeLine({
                text:
                    "启动失败: " + (e instanceof Error ? e.message : String(e)),
                type: "error",
                progress: 100,
            });
            progress.startCloseTimer(4000);
            this.state.status = "error";
            this.alertLaunchError(e);
            if (throwOnError) throw e;
            return false;
        }

        // 2. spawn
        try {
            await this.spawnProcess(spec);
        } catch (e) {
            progress.changeLine({
                text:
                    "无法启动进程: " +
                    (e instanceof Error ? e.message : String(e)),
                type: "error",
                progress: 100,
            });
            progress.startCloseTimer(4000);
            this.state.status = "error";
            ztoolkit.getGlobal("alert")(
                "无法启动本地服务进程:\n" +
                    (e instanceof Error ? e.message : String(e)),
            );
            if (throwOnError) throw e;
            return false;
        }

        // 3. 轮询 /health
        const timeoutSec = this.getNumber("serverStartTimeout", 180);
        const deadline = Date.now() + timeoutSec * 1000;
        while (Date.now() < deadline) {
            // 进程提前退出 -> 立即报错
            if (this.state.exitCode !== null) {
                const tail = this.state.stderrTail.join("").slice(-1500);
                progress.changeLine({
                    text: `本地服务启动失败(退出码 ${this.state.exitCode})`,
                    type: "error",
                    progress: 100,
                });
                progress.startCloseTimer(4000);
                this.state.status = "error";
                ztoolkit.getGlobal("alert")(
                    `本地服务启动失败(退出码 ${this.state.exitCode}):\n\n` +
                        (tail || "无输出, 请检查 uv/依赖是否可用。"),
                );
                if (throwOnError)
                    throw new Error("server exited " + this.state.exitCode);
                return false;
            }

            const version = await this.checkHealth(2500);
            if (version) {
                this.state.startedByUs = true;
                this.state.status = "running-managed";
                progress.changeLine({
                    text: `本地翻译服务已就绪 (v${version})`,
                    type: "success",
                    progress: 100,
                });
                progress.startCloseTimer(1500);
                return true;
            }

            const elapsed = Math.round(
                (Date.now() - (deadline - timeoutSec * 1000)) / 1000,
            );
            progress.changeLine({
                text: `正在启动本地翻译服务…(${elapsed}s, 首次需下载依赖)`,
                type: "default",
                progress: Math.min(90, 10 + elapsed),
            });
            await new Promise((r) => setTimeout(r, 500));
        }

        // 4. 超时(保留句柄, Stop 仍可 kill)
        this.state.startedByUs = true;
        this.state.status = "error";
        progress.changeLine({
            text: "本地服务启动超时",
            type: "error",
            progress: 100,
        });
        progress.startCloseTimer(4000);
        ztoolkit.getGlobal("alert")(
            "本地服务启动超时。首次运行可能仍在下载依赖, 可稍后重试, 或在设置中查看/延长超时时间。",
        );
        if (throwOnError) throw new Error("server start timeout");
        return false;
    }

    // ========================================================================
    // spawn + 排空管道
    // ========================================================================
    private async spawnProcess(spec: LaunchSpec): Promise<void> {
        const Subprocess = loadSubprocess();
        this.state.stderrTail = [];
        this.state.exitCode = null;

        // Mozilla Subprocess 默认已为 stdin/stdout 建立管道, 仅需显式声明 stderr:"pipe"
        // 才能拿到 proc.stderr。不传其它 std* 选项, 避免不识别的选项报错。
        const proc = await Subprocess.call({
            command: spec.command,
            arguments: spec.args,
            workdir: spec.workdir,
            environment: {
                PATH: this.buildChildPath(spec.pathPrepend),
                PYTHONUNBUFFERED: "1",
                PYTHONIOENCODING: "utf-8",
            },
            environmentAppend: true,
            stderr: "pipe",
        });
        this.state.proc = proc;

        ztoolkit.log(
            `[serverManager] 已启动 pid=${proc.pid} cmd=${spec.command} args=${JSON.stringify(
                spec.args,
            )} cwd=${spec.workdir}`,
        );

        // 必须持续排空 stdout/stderr, 否则缓冲区满会阻塞子进程
        void this.drainStream(proc.stdout, "[pdf2zh-server]", false);
        void this.drainStream(proc.stderr, "[pdf2zh-server:err]", true);

        // 记录退出
        void proc.wait().then(({ exitCode }) => {
            this.state.exitCode = exitCode;
            if (this.state.status === "running-managed") {
                this.state.status = "stopped";
            }
            ztoolkit.log(`[serverManager] server 退出 code=${exitCode}`);
        });
    }

    private async drainStream(
        pipe: SubprocessPipe,
        prefix: string,
        capture: boolean,
    ): Promise<void> {
        try {
            for (;;) {
                const chunk = await pipe.readString();
                if (!chunk) break; // "" 或 null => EOF
                ztoolkit.log(prefix, chunk.replace(/\s+$/, ""));
                if (capture) {
                    const buf = this.state.stderrTail;
                    buf.push(chunk);
                    while (buf.length > 100) buf.shift();
                }
            }
        } catch (e) {
            ztoolkit.log(prefix, "stream closed", e);
        }
    }

    // 平台判断(避免直接依赖 Zotero.isWin 的类型声明)
    private get isWin(): boolean {
        return !!(Zotero as any).isWin;
    }

    // 读当前 PATH 并前置 uv/命令所在目录, 保证 server.py 内部裸调 uv/conda 能找到
    private buildChildPath(prepend: string[]): string {
        const sep = this.isWin ? ";" : ":";
        let cur = "";
        try {
            cur = ((Services as any).env?.get?.("PATH") as string) || "";
        } catch (e) {
            /* ignore */
        }
        if (!cur) {
            try {
                const C = Components as any;
                const env = C.classes[
                    "@mozilla.org/process/environment;1"
                ].getService(C.interfaces.nsIEnvironment);
                cur = (env.get("PATH") as string) || "";
            } catch (e) {
                /* ignore */
            }
        }
        return [...prepend, cur].filter(Boolean).join(sep);
    }

    // ========================================================================
    // 启动命令构建
    // ========================================================================
    private async buildLaunchSpec(): Promise<LaunchSpec> {
        const serverDir = await this.resolveServerDir();
        const { port } = this.parseServerUrl();
        const mode = getPref("launchMode")?.toString() || "uv";

        if (mode === "custom") {
            const raw = (getPref("customCommand")?.toString() || "").trim();
            if (!raw) {
                throw new LaunchError(
                    "no-custom-command",
                    "启动方式为自定义, 但未填写自定义启动命令。",
                );
            }
            const tokens = this.tokenize(raw);
            let command = tokens[0];
            if (!this.isAbsolute(command)) {
                command = this.pathSearch(command) || command;
            }
            const args = tokens.slice(1);
            if (!args.some((a) => a.startsWith("--check_update"))) {
                args.push("--check_update=False");
            }
            return {
                command,
                args,
                workdir: serverDir,
                pathPrepend: [this.dirname(command)].filter(
                    Boolean,
                ) as string[],
            };
        }

        // uv 模式(推荐)
        const uvPath = await this.resolveUvPath();
        return {
            command: uvPath,
            args: [
                "run",
                "--python",
                "3.12",
                "--with-requirements",
                "requirements.txt",
                "server.py",
                "--check_update=False",
                "--port",
                String(port),
            ],
            workdir: serverDir,
            pathPrepend: [this.dirname(uvPath)].filter(Boolean) as string[],
        };
    }

    // serverDir 解析: 用户显式指定优先, 否则用随插件内置并自动解压的 server
    private async resolveServerDir(): Promise<string> {
        const prefDir = (getPref("serverDir")?.toString() || "").trim();
        if (prefDir) {
            if (await this.exists(PathUtils.join(prefDir, "server.py"))) {
                return prefDir;
            }
            throw new LaunchError(
                "no-server-py",
                `设置的 server 文件夹中未找到 server.py: ${prefDir}`,
            );
        }
        return await this.ensureBundledServer();
    }

    // 把随 XPI 内置的 server 解压到 Zotero 数据目录, 返回其路径。
    // 只在版本变化或缺失时解压, 不触碰已存在的 venv/translated 运行时产物。
    // 优先直接读插件资源(打包安装用 nsIZipReader 读 XPI, 开发模式读构建目录):
    // Zotero 10 起 jar: 地址无法再经 XHR/fetch 读取, 旧的 URL 方式只能作为兜底。
    private async ensureBundledServer(): Promise<string> {
        const target = PathUtils.join(
            Zotero.DataDirectory.dir,
            "pdf2zh-server",
        );
        const errors: string[] = [];
        const strategies: [string, () => Promise<string>][] = [
            ["读取插件资源", () => this.extractBundledFromSource(target)],
            ["读取 rootURI", () => this.extractBundledViaURL(target)],
        ];
        for (const [name, run] of strategies) {
            try {
                return await run();
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                ztoolkit.log(
                    `[serverManager] 内置 server 解压失败(${name}): ${msg}`,
                    e,
                );
                errors.push(`${name}: ${msg}`);
            }
        }
        throw new LaunchError(
            "no-server-dir",
            "未设置 server 文件夹, 且内置 server 解压失败, 请在设置中手动指定 server 文件夹。\n\n" +
                errors.join("\n"),
        );
    }

    // 直接从插件资源解压: 打包安装读 XPI 内的条目, 开发模式从构建目录复制
    private async extractBundledFromSource(target: string): Promise<string> {
        const root = this.parseRootURI();
        if (!root) {
            throw new Error(`无法解析插件资源位置: ${rootURI}`);
        }
        if (root.kind === "file") {
            const manifest = this.parseServerManifest(
                await IOUtils.readUTF8(
                    PathUtils.join(root.dir, "server-manifest.json"),
                ),
            );
            await this.writeBundledFiles(
                target,
                manifest,
                async (rel, outPath) => {
                    const from = PathUtils.join(
                        root.dir,
                        "server",
                        ...rel.split("/"),
                    );
                    await IOUtils.copy(from, outPath);
                },
            );
            return target;
        }
        const zip = (Components.classes as any)[
            "@mozilla.org/libjar/zip-reader;1"
        ].createInstance(Components.interfaces.nsIZipReader) as nsIZipReader;
        zip.open(Zotero.File.pathToFile(root.xpi));
        try {
            const manifest = this.parseServerManifest(
                this.readZipEntryText(
                    zip,
                    root.prefix + "server-manifest.json",
                ),
            );
            await this.writeBundledFiles(target, manifest, async (rel, out) => {
                const outFile = Zotero.File.pathToFile(out);
                if (outFile.exists()) {
                    outFile.remove(false);
                }
                zip.extract(root.prefix + "server/" + rel, outFile);
            });
            return target;
        } finally {
            try {
                zip.close();
            } catch (e) {
                /* ignore */
            }
        }
    }

    // 兜底: 经 rootURI 逐个读取文本(Zotero 7-9 可用, 只能处理文本文件)
    private async extractBundledViaURL(target: string): Promise<string> {
        const manifest = this.parseServerManifest(
            await Zotero.File.getContentsFromURLAsync(
                rootURI + "server-manifest.json",
            ),
        );
        await this.writeBundledFiles(target, manifest, async (rel, outPath) => {
            const text = await Zotero.File.getContentsFromURLAsync(
                rootURI + "server/" + rel,
            );
            await IOUtils.writeUTF8(outPath, text);
        });
        return target;
    }

    private parseServerManifest(text: string): {
        version: string;
        files: string[];
    } {
        const manifest = JSON.parse(text) as {
            version: string;
            files: string[];
        };
        if (!manifest.files || manifest.files.length === 0) {
            throw new Error("内置 server 清单为空(打包时未包含 server)");
        }
        return manifest;
    }

    // 版本标记一致则跳过, 否则用 write 回调把清单里的文件逐个落盘
    private async writeBundledFiles(
        target: string,
        manifest: { version: string; files: string[] },
        write: (rel: string, outPath: string) => Promise<void>,
    ): Promise<void> {
        const marker = PathUtils.join(target, ".bundled-version");
        const serverPy = PathUtils.join(target, "server.py");
        if ((await this.exists(serverPy)) && (await this.exists(marker))) {
            try {
                const v = await IOUtils.readUTF8(marker);
                if (v.trim() === String(manifest.version)) return;
            } catch (e) {
                /* 读不到版本标记则重新解压 */
            }
        }
        ztoolkit.log(
            `[serverManager] 解压内置 server -> ${target} (v${manifest.version}, ${manifest.files.length} 文件)`,
        );
        for (const rel of manifest.files) {
            const outPath = PathUtils.join(target, ...rel.split("/"));
            const parent = this.dirname(outPath);
            if (parent) {
                await IOUtils.makeDirectory(parent, {
                    createAncestors: true,
                    ignoreExisting: true,
                });
            }
            await write(rel, outPath);
        }
        await IOUtils.writeUTF8(marker, String(manifest.version));
    }

    // rootURI: 打包安装为 jar:file:///...xpi!/, 开发模式为 file:///.../build/addon/
    private parseRootURI():
        | { kind: "jar"; xpi: string; prefix: string }
        | { kind: "file"; dir: string }
        | null {
        const uri = rootURI || "";
        const m = /^jar:(.+?)!\/(.*)$/.exec(uri);
        if (m) {
            const xpi = this.fileURLToPath(m[1]);
            return xpi ? { kind: "jar", xpi, prefix: m[2] } : null;
        }
        if (uri.startsWith("file://")) {
            const dir = this.fileURLToPath(uri);
            return dir ? { kind: "file", dir } : null;
        }
        return null;
    }

    private fileURLToPath(url: string): string | null {
        try {
            const fileURL = (Services.io.newURI(url) as any).QueryInterface(
                Components.interfaces.nsIFileURL,
            ) as nsIFileURL;
            return fileURL.file.path || null;
        } catch (e) {
            return null;
        }
    }

    // 读 XPI 内的文本条目(UTF-8)
    private readZipEntryText(zip: nsIZipReader, entry: string): string {
        const stream = zip.getInputStream(entry);
        const converter = (Components.classes as any)[
            "@mozilla.org/intl/converter-input-stream;1"
        ].createInstance(
            Components.interfaces.nsIConverterInputStream,
        ) as nsIConverterInputStream;
        try {
            converter.init(stream, "UTF-8", 32768, 0xfffd);
            let out = "";
            const chunk = { value: "" };
            while (converter.readString(16384, chunk) !== 0) {
                out += chunk.value;
            }
            return out;
        } finally {
            try {
                converter.close();
            } catch (e) {
                /* ignore */
            }
            try {
                stream.close();
            } catch (e) {
                /* ignore */
            }
        }
    }

    // uv 解析: 偏好 -> PATH 搜索 -> 常见安装位置
    private async resolveUvPath(): Promise<string> {
        const pref = (getPref("uvPath")?.toString() || "").trim();
        if (pref && (await this.exists(pref))) return pref;

        const searched = this.pathSearch(this.isWin ? "uv.exe" : "uv");
        if (searched) return searched;

        const home = this.homeDir();
        const candidates: string[] = [];
        if (this.isWin) {
            if (home) {
                candidates.push(
                    PathUtils.join(home, ".local", "bin", "uv.exe"),
                    PathUtils.join(home, ".cargo", "bin", "uv.exe"),
                );
            }
        } else {
            if (home) {
                candidates.push(
                    PathUtils.join(home, ".local", "bin", "uv"),
                    PathUtils.join(home, ".cargo", "bin", "uv"),
                );
            }
            candidates.push(
                "/opt/homebrew/bin/uv",
                "/usr/local/bin/uv",
                "/usr/bin/uv",
            );
        }
        for (const c of candidates) {
            if (await this.exists(c)) return c;
        }
        throw new LaunchError(
            "no-uv",
            "未找到 uv 可执行文件。请安装 uv (https://astral.sh/uv), 或在设置中填写 uv 路径; 也可切换为自定义启动命令(conda/python)。",
        );
    }

    // ========================================================================
    // 工具方法
    // ========================================================================
    private parseServerUrl(): { host: string; port: number } {
        const raw =
            getPref("new_serverip")?.toString() || "http://localhost:8890";
        try {
            const u = new URL(raw);
            if (u.hostname) {
                return {
                    host: u.hostname,
                    port: u.port ? parseInt(u.port, 10) : 8890,
                };
            }
        } catch (e) {
            /* fall through to regex */
        }
        const m = raw.match(/^(?:https?:\/\/)?([^:/]+)(?::(\d+))?/i);
        return {
            host: m?.[1] || "localhost",
            port: m?.[2] ? parseInt(m[2], 10) : 8890,
        };
    }

    private isLocalHost(host: string): boolean {
        const h = (host || "").toLowerCase();
        return (
            h === "localhost" ||
            h === "127.0.0.1" ||
            h === "::1" ||
            h === "0.0.0.0"
        );
    }

    // GET /health, 返回 version 字符串或 null
    private async checkHealth(timeoutMs: number): Promise<string | null> {
        const serverUrl =
            getPref("new_serverip")?.toString() || "http://localhost:8890";
        try {
            const resp = await axios.get(`${serverUrl}/health`, {
                timeout: timeoutMs,
                headers: { "Content-Type": "application/json" },
            });
            if (resp.status === 200 && resp.data) {
                return String(resp.data.version || "unknown");
            }
            return null;
        } catch (e) {
            return null;
        }
    }

    // 引号感知分词(支持含空格路径)
    private tokenize(input: string): string[] {
        const out: string[] = [];
        const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(input)) !== null) {
            out.push(m[1] ?? m[2] ?? m[3] ?? "");
        }
        return out.filter((t) => t.length > 0);
    }

    private pathSearch(cmd: string): string | null {
        try {
            const Subprocess = loadSubprocess();
            return Subprocess.pathSearch(cmd) || null;
        } catch (e) {
            return null;
        }
    }

    private dirname(p: string): string {
        try {
            return ((PathUtils as any).parent(p) as string) || "";
        } catch (e) {
            const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
            return idx > 0 ? p.slice(0, idx) : "";
        }
    }

    private isAbsolute(p: string): boolean {
        return /^([a-zA-Z]:[\\/]|[\\/])/.test(p);
    }

    private homeDir(): string {
        try {
            const h = (PathUtils as any).homeDir;
            if (h) return h as string;
        } catch (e) {
            /* ignore */
        }
        try {
            return ((Services as any).env?.get?.("HOME") ||
                (Services as any).env?.get?.("USERPROFILE") ||
                "") as string;
        } catch (e) {
            return "";
        }
    }

    private async exists(path: string): Promise<boolean> {
        try {
            return await IOUtils.exists(path);
        } catch (e) {
            return false;
        }
    }

    private getBool(key: string, dflt: boolean): boolean {
        const v = getPref(key);
        if (v === undefined) return dflt;
        return v === true || v === "true" || v === 1 || v === "1";
    }

    private getNumber(key: string, dflt: number): number {
        const v = getPref(key);
        const n = typeof v === "number" ? v : parseInt(String(v), 10);
        return Number.isFinite(n) && n > 0 ? n : dflt;
    }

    private alertLaunchError(e: unknown): void {
        const msg = e instanceof Error ? e.message : String(e);
        ztoolkit.getGlobal("alert")("无法启动本地翻译服务:\n\n" + msg);
    }
}
