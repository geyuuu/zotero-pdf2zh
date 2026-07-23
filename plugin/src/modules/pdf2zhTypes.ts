export enum PDFType {
    MONO = "mono",
    DUAL = "dual",
    MONO_CUT = "mono-cut",
    DUAL_CUT = "dual-cut",
    CROP_COMPARE = "crop-compare",
    COMPARE = "compare",
    ORIGIN_CUT = "origin-cut",
    ORIGIN = "origin",
    UNKNOWN = "unknown",
}

export interface ServerConfig {
    serverUrl: string;
    threadNum: string;
    qps: string;
    poolSize: string;
    engine: string;
    service: string;
    next_service: string;

    skipLastPages: string;
    sourceLang: string;
    targetLang: string;
    // generate
    mono: string;
    mono_cut: string;
    dual: string;
    dual_cut: string;
    crop_compare: string;
    compare: string;

    // pdf1x专用配置
    babeldoc: string;
    skipSubsetFonts: string;
    fontFile: string;

    // pdf2x专用配置
    ocr: string;
    autoOcr: string;
    transFirst: string;
    noWatermark: string;
    fontFamily: string;
    dualMode: string;
    saveGlossary: string;
    disableGlossary: string;
    noDual: string;
    noMono: string;
    skipClean: string;
    disableRichTextTranslate: string;
    enhanceCompatibility: string;
    translateTableText: string;
    onlyIncludeTranslatedPage: string;
}

export interface PDFOperationOptions {
    rename: boolean;
    openAfterProcess: boolean;
}

// 本地服务(自动拉起后端)相关类型
export type ServerStatus =
    | "unknown"
    | "checking"
    | "starting"
    | "running-external" // 检测到已有服务(非本插件启动), 复用且不 kill
    | "running-managed" // 由本插件启动并管理的服务
    | "stopped"
    | "error";

export interface LaunchSpec {
    command: string; // 可执行文件绝对路径
    args: string[]; // 参数
    workdir: string; // 工作目录(= serverDir)
    pathPrepend: string[]; // 需前置到子进程 PATH 的目录(如 uv/conda 所在目录)
}
