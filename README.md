# AI 与 C 语言考试模拟系统

基于 HTML、CSS 和原生 JavaScript 的习题网页。保留题库、来源 PDF、解析文本与提取脚本；本轮只整理仓库文件与使用说明，不改变页面、题目或判分逻辑。

## 分支说明

- 远程默认分支为 master；main 的历史运行中有成功的 GitHub Pages 部署记录。
- 两分支内容不同，本轮分别整理；不合并、重设默认分支或删除已有分支。
- 本说明对应 main 分支。网页部署是否反映当前默认分支，需要单独核实，不能把历史部署成功当作网页功能已验收。

## 文件入口

| 文件 | 用途 |
|---|---|
| [index.html](index.html) | 页面入口 |
| [app.js](app.js) | 登录、抽题、计时、判分与本地成绩逻辑 |
| [style.css](style.css) | 页面样式 |
| [ai_data.js](ai_data.js)、[c_data.js](c_data.js) | 页面实际加载的题库 |
| [ai_questions.json](ai_questions.json)、[c_questions.json](c_questions.json) | 解析得到的 JSON 数据 |
| [extract/parse_pdfs.py](extract/parse_pdfs.py) | PDF 提取脚本，路径位于 extract/ |
| [整理与验证记录](docs/hygiene-20261103.md) | 取消追踪清单、实际检查和回滚 |

原有 PDF、ai_full.txt、c_full.txt 与 Windows 启动脚本保留。网页运行不需要安装 npm 依赖。

## 本地运行

安装 Python 3，在仓库根目录执行：

```sh
python -m http.server 8765 --bind 127.0.0.1
```

浏览器打开 http://127.0.0.1:8765/ ，按 Ctrl+C 停止。此命令只用于本机，不执行现有启动脚本中的防火墙或公网映射操作。

原有启动服务器.bat、启动服务器.py 和启动ngrok.bat 仍保留；ngrok 批处理使用原作者电脑的固定路径，尚未通用化。本轮没有启动公网隧道、修改防火墙或执行推送脚本。

## 数据与可复现性

- 保留来源 PDF、题库 JS/JSON、提取文本和脚本，不因它们可重新提取而删除。
- 提取脚本中的路径和题目解析规则需要针对实际资料检查；本轮没有重新生成或覆盖题库。
- `.trae-html-share-packages/index.html.zip`：保留原有分享快照，不将其按扩展名当作垃圾删除。

## 验证状态与范围

本轮对干净导出目录执行 JS 语法检查、JSON 解析、页面题库载入和本机 HTTP 资源检查，具体结果见整理记录。这些检查不等于完成浏览器交互、考试判分、倒计时或跨设备验收。未为整理增加新框架或关键依赖。

源资料及题目版权归原作者；本轮没有新增许可证或更改资料授权。
