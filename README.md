<div align="center">

![Zotero PDF2zh](./favicon@0.5x.svg)

<h2 id="title">Zotero PDF2zh</h2>

[![zotero target version](https://img.shields.io/badge/Zotero-7-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)
[![zotero target version](https://img.shields.io/badge/Zotero-8-blue?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org/support/beta_builds)
[![Using Zotero Plugin Template](https://img.shields.io/badge/Using-Zotero%20Plugin%20Template-blue?style=flat-square&logo=github)](https://github.com/windingwind/zotero-plugin-template)
![Downloads release](https://img.shields.io/github/downloads/guaguastandup/zotero-pdf2zh/total?color=yellow)
[![License](https://img.shields.io/github/license/guaguastandup/zotero-pdf2zh)](https://github.com/guaguastandup/zotero-pdf2zh/blob/main/LICENSE)
[![zread](https://img.shields.io/badge/Ask_Zread-_.svg?style=flat&color=00b0aa&labelColor=000000&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTQuOTYxNTYgMS42MDAxSDIuMjQxNTZDMS44ODgxIDEuNjAwMSAxLjYwMTU2IDEuODg2NjQgMS42MDE1NiAyLjI0MDFWNC45NjAxQzEuNjAxNTYgNS4zMTM1NiAxLjg4ODEgNS42MDAxIDIuMjQxNTYgNS42MDAxSDQuOTYxNTZDNS4zMTUwMiA1LjYwMDEgNS42MDE1NiA1LjMxMzU2IDUuNjAxNTYgNC45NjAxVjIuMjQwMUM1LjYwMTU2IDEuODg2NjQgNS4zMTUwMiAxLjYwMDEgNC45NjE1NiAxLjYwMDFaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik00Ljk2MTU2IDEwLjM5OTlIMi4yNDE1NkMxLjg4ODEgMTAuMzk5OSAxLjYwMTU2IDEwLjY4NjQgMS42MDE1NiAxMS4wMzk5VjEzLjc1OTlDMS42MDE1NiAxNC4xMTM0IDEuODg4MSAxNC4zOTk5IDIuMjQxNTYgMTQuMzk5OUg0Ljk2MTU2QzUuMzE1MDIgMTQuMzk5OSA1LjYwMTU2IDE0LjExMzQgNS42MDE1NiAxMy43NTk5VjExLjAzOTlDNS42MDE1NiAxMC42ODY0IDUuMzE1MDIgMTAuMzk5OSA0Ljk2MTU2IDEwLjM5OTlaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik0xMy43NTg0IDEuNjAwMUgxMS4wMzg0QzEwLjY4NSAxLjYwMDEgMTAuMzk4NCAxLjg4NjY0IDEwLjM5ODQgMi4yNDAxVjQuOTYwMUMxMC4zOTg0IDUuMzEzNTYgMTAuNjg1IDUuNjAwMSAxMS4wMzg0IDUuNjAwMUgxMy43NTg0QzE0LjExMTkgNS42MDAxIDE0LjM5ODQgNS4zMTM1NiAxNC4zOTg0IDQuOTYwMVYyLjI0MDFDMTQuMzk4NCAxLjg4NjY0IDE0LjExMTkgMS42MDAxIDEzLjc1ODQgMS42MDAxWiIgZmlsbD0iI2ZmZiIvPgo8cGF0aCBkPSJNNCAxMkwxMiA0TDQgMTJaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik00IDEyTDEyIDQiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8L3N2Zz4K&logoColor=ffffff)](https://zread.ai/guaguastandup/zotero-pdf2zh)

在Zotero中使用[PDF2zh](https://github.com/Byaidu/PDFMathTranslate)和[PDF2zh_next](https://github.com/PDFMathTranslate/PDFMathTranslate-next)

**📚 项目文档：** [zotero-pdf2zh.github.io](https://zotero-pdf2zh.github.io)

## ✨ fork 新增：插件内自动启动后端

本 fork 在原有「手动启动 `server.py`」之外，新增了 **由插件在 Zotero 内自动管理后端** 的能力，让你不用再开终端：

- **自动启动/关闭**：翻译时插件会自动在后台拉起翻译后端（`pdf2zh_next`），退出 Zotero 时自动关闭；无需手动运行 `server.py`。
- **内置 server**：`server/` 已随插件一起打包进 xpi，**设置里的「server 文件夹路径」留空即可**——首次翻译时插件会自动把内置 server 解压到 Zotero 数据目录（`<数据目录>/pdf2zh-server/`）并使用。
- **实时进度入口**：主工具栏新增 PDF2zh 图标按钮（右键菜单、设置页也有「查看翻译进度」），点击用浏览器打开后端自带的实时进度页（进度条 / 历史 / 下载）。

> ⚠️ 翻译后端是 Python 程序（依赖 BabelDOC/PyMuPDF/ONNX 等原生库），**无法嵌入 Zotero 的 JS 引擎直接运行**，因此仍需本机装过一次 **uv**（或 Python）。"整合进插件"指的是由插件自动启动并管理后端进程，而非在 JS 里跑 Python。



### 使用方法

1. 安装插件 xpi 并重启 Zotero。
2. 插件设置 →「本地翻译服务」：勾选「翻译前自动启动本地服务」，`server 文件夹路径` **留空**（用内置），启动方式保持 `uv`（uv 路径留空会自动查找）。
3. 右键 PDF → PDF2zh → 翻译。首次会自动启动后端并下载依赖（需几分钟），之后即用即翻。

> 高级：想用自己的 `server/` 目录或 conda/python，在「本地翻译服务」里指定 `server 文件夹路径`、把启动方式切到 `custom` 并填自定义命令即可（会覆盖内置 server）。若你更习惯手动启动服务，也可关闭「自动启动」，按下方[安装说明](#安装说明)手动运行 `server.py`。

---
