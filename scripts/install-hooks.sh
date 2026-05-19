#!/usr/bin/env bash
# Wires the in-repo hooks under scripts/ into .git/hooks/. Idempotent.
# Run once per clone:  ./scripts/install-hooks.sh

set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
hooks_src="$repo_root/scripts"
hooks_dst="$repo_root/.git/hooks"

for hook in pre-commit pre-push; do
    src="$hooks_src/$hook"
    dst="$hooks_dst/$hook"
    if [[ ! -f "$src" ]]; then
        echo "[install-hooks] missing $src, skipping" >&2
        continue
    fi
    # Symlink so future edits to scripts/<hook> take effect immediately.
    ln -sf "../../scripts/$hook" "$dst"
    chmod +x "$src"
    echo "[install-hooks] installed $hook -> scripts/$hook"
done

echo "[install-hooks] done."
