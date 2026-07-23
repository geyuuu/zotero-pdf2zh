// zotero-types 通过 MainWindow 接口提供了 Components/Cc/Ci/Cu/Services 等全局,
// 但没有声明 ChromeUtils。serverManager.ts 需要用 ChromeUtils.importESModule 加载
// Mozilla Subprocess 模块, 这里补充最小可用的全局声明(取用时再 as any)。
declare const ChromeUtils: {
    importESModule(uri: string): any;

    import(uri: string): any;
};
