// base class
import { config } from "../package.json";
import {
    ColumnOptions,
    VirtualizedTableHelper,
    DialogHelper,
} from "zotero-plugin-toolkit";
import hooks from "./hooks";
import { createZToolkit } from "./utils/ztoolkit";
import { LLMApiData } from "./modules/llmApiManager";
import { ServerStatus } from "./modules/pdf2zhTypes";

class Addon {
    public data: {
        alive: boolean;
        config: typeof config;
        // Env type, see build.js
        env: "development" | "production";
        ztoolkit: ZToolkit;
        locale?: {
            current: any;
        };
        prefs?: {
            window: Window;
            columns: Array<ColumnOptions>;
            rows: Array<{ [dataKey: string]: string }>;
            tableHelper?: VirtualizedTableHelper;
        };
        dialog?: DialogHelper;
        llmApis: {
            map: Map<string, LLMApiData>;
            cachedKeys: string[];
            selectedKey?: string;
        };
        // 本地服务(自动拉起后端)运行时状态
        server: {
            proc: any | null; // Mozilla Subprocess 句柄
            startedByUs: boolean; // 仅当为 true 才允许 kill(不杀外部/远程服务)
            status: ServerStatus;
            startPromise: Promise<boolean> | null; // 去重并发的 ensureServerRunning
            stderrTail: string[]; // 最近若干行 stderr, 用于报错展示
            exitCode: number | null; // 进程退出码(未退出为 null)
        };
    };
    // Lifecycle hooks
    public hooks: typeof hooks;
    // APIs
    public api: object;

    constructor() {
        this.data = {
            alive: true,
            config,
            env: __env__,
            ztoolkit: createZToolkit(),
            llmApis: {
                map: new Map<string, LLMApiData>(),
                cachedKeys: [],
            },
            server: {
                proc: null,
                startedByUs: false,
                status: "unknown",
                startPromise: null,
                stderrTail: [],
                exitCode: null,
            },
        };
        this.hooks = hooks;
        this.api = {};
    }
}

export default Addon;
