# Xinghe Zhihui v2.0.46

## Hotfix
- Restored legacy project nodes from old JSON shapes and SQLite fallback data so updated clients no longer open projects with an empty canvas.
- Added an Aliyun OSS upload configuration section in Settings > Services, storing AK/SK with local secure storage for reference-media uploads in packaged builds.
- Kept `.env` files excluded from the installer while allowing saved OSS credentials to be used at runtime.

# Xinghe Zhihui v2.0.44

## Hotfix
- Added microphone voice input to Xinghe companion chat and the Codex-style workspace composer.
- Reworked desktop voice capture to record standard WAV audio before transcription, avoiding Chromium Web Speech and WebM duration failures.
- Added clear recording, recognition, and failure feedback for microphone input.

# Xinghe Zhihui v2.0.43

## Hotfix
- Fixed local generated video previews failing to load from history and node result cards by registering the custom `xinghe://local` protocol as a streaming media scheme.
- Restored stream-based range responses for local video playback while keeping stricter range validation.
- Made node result image previews and image actions prefer local cached media before falling back to temporary remote URLs.

# Xinghe Zhihui v2.0.42

## Hotfix
- Fixed repeated completed-task preview updates that could trigger React maximum update depth errors after a generated video appeared.
- Made history and local-cache writeback idempotent so unchanged local cache paths no longer rewrite history or node results.
- Deduplicated model lists and stabilized result card keys to avoid duplicate React keys for models such as `gemini-3.1-flash-image-preview-2k`.

# Xinghe Zhihui v2.0.41

## Hotfix
- Restored one-click preview for generated image/video result cards.
- Fixed generated and history video cards showing gray placeholders by allowing low-concurrency first-frame thumbnail capture.
- Reduced random UI stalls while opening settings or clicking around by serializing and delaying local thumbnail generation work in the main process.
- Added an immediate lightweight modal-loading fallback so settings clicks give feedback while the settings chunk loads.

# Xinghe Zhihui v2.0.40

## Hotfix
- Reduced the chance of Windows file picker freezes when adding reference images, videos, or audio from generation nodes by opening from stable local media/download folders instead of stale system locations.
- Added a busy guard to generation-node media add buttons so repeated clicks cannot stack multiple file-pick requests.

# Xinghe Zhihui v2.0.39

## Hotfix
- Fixed per-model API URL/key overrides not being applied reliably when generation or chat resolved a model by `modelName` instead of config `id`.
- Fixed chat requests ignoring per-model API URL/key overrides and falling back to the group/default API settings.
- Stopped initialization from overwriting user-entered per-model Seedance/Doubao API settings.
- Preserved user-entered per-model Base URLs exactly, including legacy/private gateways, and made "restore group default" truly clear model-level URL/key overrides.

# Xinghe Zhihui v2.0.37

## Hotfix
- Kept the low-effects rendering mode focused on heavy blur/shadow work so normal UI transitions stay smooth.
- Lowered automatic canvas performance mode activation from 50 nodes to 20 nodes.
- Reduced canvas drag overhead by pausing node animations and hiding heavy media only while dragging.
- Stopped the pet companion's continuous idle motion in low-effects mode.
- Restored the legacy welcome/home screen when no project is open.
- Made Settings > Model API Config reuse the filtered model list instead of recalculating it during each render.

# Xinghe Zhihui v2.0.36

## Hotfix
- Fixed Settings > Model API Config model right-click menus and per-model config panels being rendered behind the settings modal.

# Xinghe Zhihui v2.0.35

## Hotfix
- Migrated the known legacy Seedance video gateway `http://47.108.196.234:10086/prod` back to `https://www.lingjingxinghe.cn` when loading saved settings.
- Added runtime safeguards so old projects and failed-history retries no longer submit Seedance video tasks to the legacy gateway.
- Made model chips in Settings > Model API Config open their per-model API config with a left click while keeping the right-click menu.
- Added coverage for the legacy video gateway migration.

# Xinghe Zhihui v2.0.34

## Hotfix
- Fixed video previews choosing relative cache paths such as `videos/*.mp4` before playable local cache URLs.
- Improved shared media URL selection so old LocalCache videos and new ProjectCache videos both prefer valid `xinghe://local` or absolute media paths.
- Stopped opening settings from automatically rewriting large project JSON files just to configure cache context.
- Made cache statistics in settings manual instead of scanning local files on entry.
- Reduced project-entry animation delay and skipped thumbnail capture when creating a fresh project to improve responsiveness.
- Added coverage for media URL selection to prevent video preview regressions.

# Xinghe Zhihui v2.0.33

## Hotfix
- Fixed updater preflight deleting the already-downloaded installer from the pending update cache before installation.
- Added installer-cache validation before restart-and-install so missing pending installers show an in-app retry message instead of a Windows "file not found" dialog.
- Cleared stale updater cache before a fresh download to avoid reusing incomplete installer state.

# Xinghe Zhihui v2.0.32

## Hotfix
- Fixed the settings dialog failing to open after the legacy project repair prompt was added.
- Kept legacy video cache behavior aligned with older projects: videos stay in the original LocalCache location instead of being copied during repair.

# Xinghe Zhihui v2.0.31

## Hotfix
- Added a clear confirmation before legacy project repair so users know first repair can take time.
- Limited settings auto-repair to the current project instead of scanning and rewriting every project.
- Rewrote legacy relative video cache references to playable local URLs while preserving the original LocalCache video files instead of copying large media.
- Added an Electron clipboard fallback for copying diagnostics when the window is not focused.

# Xinghe Zhihui v2.0.30

## Hotfix
- Fixed updater preflight incorrectly treating the current Electron helper processes as separate running Xinghe instances.
- Allowed active runtime lock files during restart-and-install because they are released when the app quits for update.
- Changed install-directory write access from a blocking failure to a warning so the installer can continue or request elevation.

# Xinghe Zhihui v2.0.29

## Hotfix
- Added compatibility cleanup for legacy project nodes, views, and connections so old project files do not break the canvas.
- Isolated workspace, canvas, and settings crashes so one legacy project error no longer prevents settings or project tools from opening.
- Reset missing production board state when switching old projects to avoid carrying stale data from the previous project.
- Rejected unavailable legacy cache roots and fell back to the default project cache folder.

# Xinghe Zhihui v2.0.28

## Hotfix
- Fixed garbled Chinese text on the installer license page by switching the NSIS license resource to Unicode RTF.
- Fixed workspace attachment and assistant file-picker buttons not reliably opening the system picker.
- Raised global settings modals above workspace overlays so settings can open from the workspace.
- Made opening local folders non-blocking and guarded against missing paths or repeated Explorer opens.

# Xinghe Zhihui v2.0.27

## Hotfix
- Fixed canvas project cache folder selection getting stuck when the previous cache path is missing or unavailable.
- Stopped project cache path text inputs from saving on every keystroke; paths are now applied after selection or when editing finishes.
- Made cache directory initialization asynchronous and persisted cacheRoot updates back into project JSON metadata.

# Xinghe Zhihui v2.0.26

## Codex-style Workspace
- Added an independent workspace-first project manager with project folders and workspace files separated from canvas/production projects.
- New workspace projects now bind to a local folder first, using it as the project access root and cache root.
- Workspace project folders now remain visible even before files are added, and the header shows the current project folder, workspace file, and local directory.
- Added command-palette export/import for workspace metadata via `xinghe-workspace-export.json`, covering project folders, workspace files, tasks, audit records, browser evidence, and review reports.
- Command palette search now supports ArrowUp/ArrowDown selection and Enter execution for keyboard-first workflows.
- Added workspace folder rebinding from the sidebar and command palette so moved or missing local directories can repair project cache/access roots.
- Workspace imports can now rebind missing local project folders during import, updating project folders plus workspace file cache/access roots and recording tasks/audit entries.
- Added Codex-like composer features: Enter to send, media/file paste and drag-drop, attachment thumbnails/previews, model switching, slash commands, and command palette.
- Readable text/code attachments now generate concise summaries and pass bounded text previews into workspace assistant context.
- Word `.docx` attachments now extract raw text via the existing document parser and include bounded previews in workspace assistant context.
- Attachment cache failures in the workspace now create task and audit records with the failing file names and reasons.
- Assistant replies in the workspace now render Markdown and code blocks.
- Clipboard/dragged media without a local path is persisted into the current project cache folder.
- Added a recent artifacts card in the progress panel with thumbnails, preview, path copy, reveal-in-folder, and reuse-in-composer actions for current workspace materials.
- Recent artifacts now merge current-file materials with workspace-wide project/file materials and show their source project/file.
- Workspace assistant requests now include recent material paths and source project/file context for reuse across conversations.
- Workspace assistant requests now include the latest scanned directory index so local files can be referenced with project context.

## Computer, Browser, and Review Tools
- Added workspace-aware computer access policy with scoped/global access, read/write/delete/command permissions, and approval modes.
- Added settings controls for request approval, assisted approval, and full access.
- Added an expandable workspace audit card in the progress panel with readable operation labels, target paths, errors, and timestamps.
- Pending approvals and approval audit entries now explain why write/copy/move/delete/command/terminal operations are sensitive.
- Pending approvals now appear as actionable cards in the progress panel with approve/reject controls and risk reasons.
- Approval decisions now create task records with target paths, commands, result state, and stdout/stderr summaries.
- Approval mode is now saved per workspace file and restored when switching files, and the mode is included in workspace context.
- Project folders can now save access roots, permission switches, access scope, and approval mode as defaults for new workspace files, with one-click apply to existing files in that project.
- Added expandable task details with localized task status labels and contextual details for Skill, automation, browser, and review tasks.
- Added current project directory open action from the composer and command palette.
- Added browser URL opening, browser review tasks, real URL inspection with HTTP/title evidence, page screenshot evidence, DOM inspection, controlled element clicking, viewport screenshot matrices, annotated screenshots, controlled form filling, user-started persistent browser sessions from the workspace URL controls, and a Git summary tool for AI review workflows.
- Added a workspace context tool so AI can inspect the current workspace file, access roots, approval mode, directory index, recent materials, tasks, browser evidence, and review summaries before acting.
- Added browser console diagnostics for collecting page console warnings/errors, load failures, renderer crashes, and writing the summary back to browser evidence.
- PDF and Excel attachments now extract bounded text/table previews into workspace context; PDF opens in the attachment preview, and text-like documents show a scrollable extracted preview.
- Persistent browser sessions now keep a console/load/crash buffer, and session console diagnostics can inspect the current logged-in page without reloading it.
- Workspace browser sessions now use project/file-bound persistent profiles by default, allowing cookies and localStorage login state to be reused in later sessions for the same workspace.
- Added a browser evidence card in the progress panel with recent URL status, title, screenshot/DOM/viewport/session summaries, quick re-check, direct screenshot/DOM evidence refresh, expandable recent browser history, screenshot path copy, session close, record removal, and clear-all actions.
- Browser evidence cards can now reopen the latest target as a persistent preview session using the current workspace profile.
- Added a structured workspace review card that combines git status and diff numstat, showing file risk, status, additions, deletions, expandable diff snippets, copyable diff snippets, and copyable Markdown review reports in the progress panel.
- Workspace review reports now compare against the previous successful review for the same directory, showing newly changed files, resolved files, unchanged files, and line-count deltas.
- Review diff snippets are now parsed into per-file hunk sections so the progress panel and copied reports can inspect changes hunk by hunk.
- Review cards can now expand from the compact diff preview to all captured diff files and hunks.
- Each review hunk can now copy an inline-review draft with file, hunk header, and diff context.
- Added recommended Skills for browser review, release checks, and asset intake checks, with recommended Skill installs plus Skill, preset, pipeline, and timer actions now written back to workspace tasks and audit records.
- Recommended workspace Skills now begin by reading workspace context so browser review, release checks, and asset intake can use current project state.
- The workspace plugin page now reads the local Skill library and shows installed Skill status with a direct management entry.
- Automation templates now create workspace tasks, audit records, and ready-to-run composer drafts instead of only opening another panel.
- Automation now shows a compact recent-record list backed by workspace tasks, keeping template runs visible without adding a heavy job panel.
- Automation history can now be filtered by status, expanded for details, copied, and replayed back into the workspace composer.
- Automation now exposes timer plans for retry checks, production queue checks, cache checks, and progress summaries, with task/audit records for create and cancel actions.
- Automation history details now include a step timeline and failed automation records can generate an editable retry request.
- Automation retry tasks now keep source task, attempt count, backoff minutes, and next retry time metadata.
- Automation retry tasks are now picked up by a local due-task executor, dispatched back into the workspace conversation, and marked running/done/failed with audit records.
- Workspace browser sessions can now import user-provided cookies JSON into the current persistent browser profile, with UI, AI tool, evidence, and audit writeback.
- Workspace browser tools can now discover common local Chrome, Edge, Brave, and Firefox profile directories, recording profile candidates as browser evidence without decrypting cookies.
- Workspace browser tools can now directly import encrypted cookies from discovered Windows Chromium profiles into the workspace persistent browser session using DPAPI + AES-GCM decryption.
- The workspace plugin page now has persistent connector toggles for Feishu, code hosting, Figma, local browser, and cloud assets; connector state is recorded in tasks/audit and added to AI workspace context.
- Added `post_github_pr_comment`, a gh CLI backed tool for posting normal or inline GitHub PR review comments from an authorized workspace directory.
- Review cards can now keep a PR number, open editable per-hunk inline comment drafts, and send those comments back to GitHub from the progress panel.
- Added `submit_github_pr_review`, allowing authorized workspaces to submit a full GitHub PR Review with multiple inline comments through the local gh CLI.
- Added `post_gitlab_mr_comment`, allowing authorized workspaces to write GitLab Merge Request notes through the local glab CLI.
- Workspace assistant replies now show a compact operation trace with tool names, success/failure state, and error summaries.
- PDF and Excel attachments now surface extraction truncation details and parse failures in attachment summaries and AI context.
- Workspace attachments now keep searchable document indexes: PDF pages, Excel sheet/row chunks, and Word/text chunks can be queried through `search_workspace_documents`.
- The workspace Feishu page now reads FeishuBridge status, lists chats, tests the connection, and can send a workspace test message.
- Feishu confirmation tasks now include a task ID, and incoming Feishu confirmation/rejection messages can mark the matching workspace task done or failed with audit writeback.
- The progress panel now shows recent approved, rejected, and failed local operations with copyable execution details.
- Workspace permission controls now use shorter approval, directory, and global-access copy.
- Added a browser regression automation template for URL, DOM, screenshot, mobile viewport, and key-interaction checks.
- Feishu confirmation tasks now create workspace task/audit records and prepare an editable mobile confirmation draft in the composer.

## Interaction Fixes
- Removed visible Agent/multi-agent wording from user-facing automation UI while keeping collaboration behavior internal.
- Workspace conversations now switch from the first-prompt layout into a Codex-like message stream with user bubbles, assistant response actions, copy controls, and clickable historical attachment previews.
- Long assistant responses now show a compact clickable outline when multiple Markdown headings are present.
- While a workspace response is running, the message stream now shows collapsible processing steps and includes recent local operation results in the next request context.
- Localized the automation floating panel's main user-facing labels for skills, presets, pipelines, timers, and actions.
- Manual update check results no longer auto-dismiss after a few seconds; they stay visible until closed.

## Project Cache
- Switched generated cache writes to project-scoped cache folders.
- Added per-project cache directory selection in settings and history tools.
- Removed app-level cache capacity controls and global image/video cache directory settings.
- Kept legacy LocalCache paths readable for older project references and cleanup.

## Upgrade Compatibility
- Project JSON now persists cacheRoot so cache location travels with the project.
- Cache cleanup, diagnosis, thumbnails, downloads, asset copies, and video concatenation now use the current project context.
- Clearing a project cache only removes software-managed cache files and keeps user source assets untouched.

## Stability
- Prevented old global image/video path settings from overwriting project cache configuration.
- Improved cache path reset behavior so empty cacheRoot falls back to the default project cache folder.
