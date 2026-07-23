import { MenuitemOptions } from "zotero-plugin-toolkit";
import { getString } from "../utils/locale";

export class PDF2zhBasicFactory {
    static registerPrefs() {
        Zotero.PreferencePanes.register({
            pluginID: addon.data.config.addonID,
            src: rootURI + "content/preferences.xhtml",
            label: getString("prefs-title"),
            image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.svg`,
        });
    }
}

export class PDF2zhUIFactory {
    static registerRightClickMenuItem() {
        const menuIcon = `chrome://${addon.data.config.addonRef}/content/icons/favicon@0.5x.svg`;
        const MENU_ITEMS = [
            {
                id: "translate-pdf",
                label: getString("prefs-menu-translate"),
                command: "translatePDF",
            },
            {
                id: "crop-pdf",
                label: getString("prefs-menu-cut"),
                command: "cropPDF",
            },
            {
                id: "compare-pdf",
                label: getString("prefs-menu-compare"),
                command: "comparePDF",
            },
            {
                id: "crop-compare-pdf",
                label: getString("prefs-menu-crop-compare"),
                command: "crop-comparePDF",
            },
            {
                id: "view-progress",
                label: getString("prefs-menu-progress"),
                command: "viewProgress",
            },
        ];
        const pdf2zhMenu: MenuitemOptions = {
            tag: "menu",
            id: "zotero-itemmenu-pdf2zh",
            icon: menuIcon,
            label: `PDF2zh`,
            children: MENU_ITEMS.map(({ id, label, command }) => ({
                tag: "menuitem",
                id: `zotero-itemmenu-${id}`,
                label: `PDF2zh: ${label}`,
                commandListener: () => addon.hooks.onDialogEvents(command),
                icon: menuIcon,
            })),
        };
        ztoolkit.Menu.register("item", pdf2zhMenu);
    }

    // 在主窗口的条目工具栏(#zotero-items-toolbar)添加"查看翻译进度"按钮
    static registerToolbarButton(win: Window) {
        const doc = win.document;
        const toolbar = doc.getElementById("zotero-items-toolbar");
        if (!toolbar) return;
        const btnId = "zotero-tb-pdf2zh-progress";
        if (doc.getElementById(btnId)) return; // 防重复
        const icon = `chrome://${addon.data.config.addonRef}/content/icons/favicon@0.5x.svg`;

        // 注入图标尺寸约束: 工具栏按钮图标固定 16px, 避免原始 SVG 过大撑满工具栏
        const styleId = "pdf2zh-toolbar-style";
        if (!doc.getElementById(styleId)) {
            const styleEl = ztoolkit.UI.createElement(doc, "style", {
                id: styleId,
                namespace: "html",
            });
            styleEl.textContent = `
                #${btnId} { list-style-image: url("${icon}"); }
                #${btnId} .toolbarbutton-icon,
                #${btnId} image {
                    width: 16px !important; height: 16px !important;
                    max-width: 16px; max-height: 16px;
                }
            `;
            (doc.head || doc.documentElement).appendChild(styleEl);
        }

        // 用 list-style-image(而非 image 属性)提供图标, 让 zotero-tb-button 正常按工具栏尺寸渲染
        const button = ztoolkit.UI.createElement(doc, "toolbarbutton", {
            id: btnId,
            namespace: "xul",
            attributes: {
                class: "zotero-tb-button",
                tooltiptext: `PDF2zh: ${getString("prefs-menu-progress")}`,
            },
            listeners: [
                {
                    type: "command",
                    listener: () => addon.hooks.onDialogEvents("viewProgress"),
                },
            ],
        });
        // 放在搜索框之前(左侧按钮组末尾), 拿不到搜索框则追加到工具栏末尾
        const searchBox = doc.getElementById("zotero-tb-search");
        if (searchBox && searchBox.parentElement === toolbar) {
            toolbar.insertBefore(button, searchBox);
        } else {
            toolbar.appendChild(button);
        }
    }
}
