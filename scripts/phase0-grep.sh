#!/usr/bin/env bash
set -euo pipefail

echo "== TutorialKit interactive POC repo probe =="

echo
echo "-- WorkspacePanel editor callbacks --"
rg -n "onEditorChange|onEditorScroll|onFileSelect|setCurrentDocumentContent|setSelectedFile" packages/react/src/Panels/WorkspacePanel.tsx || true

echo
echo "-- TutorialStore APIs --"
rg -n "takeSnapshot|updateFile|setSelectedFile|setCurrentDocumentContent|setCurrentDocumentScrollPosition|reset\(|solve\(" packages/runtime/src/store/index.ts || true

echo
echo "-- EditorStore APIs --"
rg -n "selectedFile|documents|updateFile|updateScrollPosition|onDocumentChanged" packages/runtime/src/store/editor.ts || true

echo
echo "-- CodeMirror callbacks --"
rg -n "OnChangeCallback|OnScrollCallback|dispatchTransactions|onChange|onScroll" packages/react/src/core/CodeMirrorEditor/index.tsx || true

echo
echo "-- Runner snapshot/files --"
rg -n "takeSnapshot|prepareFiles|updateFile|updateFiles|_currentFiles|_currentTemplate" packages/runtime/src/store/tutorial-runner.ts || true

echo
echo "-- Existing diff utilities --"
rg -n "diffFiles|areFilesEqual|toFileTree" packages/runtime/src/webcontainer/utils/files.ts || true

echo
echo "Done. If rg is unavailable, install ripgrep or rerun with grep."
