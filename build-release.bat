@echo off
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
REM GH_TOKEN 应通过环境变量设置，不要硬编码在代码中
REM 请在系统环境变量中设置 GH_TOKEN，或在命令行中运行: set GH_TOKEN=你的Token
npm run build:win -- -p always
