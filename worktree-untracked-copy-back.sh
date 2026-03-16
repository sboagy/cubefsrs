#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# worktree-untracked-copy-back.sh
# Inverse of worktree-untracked-copy.sh.
# Copies important untracked/local-only files from this worktree back to the
# main repo at ../../cubefsrs, preserving relative paths.
#
# Usage:
#   ./worktree-untracked-copy-back.sh

main() {
    local src_root
    src_root="$(pwd)"
    local dest_root="../../cubefsrs"

    if [[ ! -d "$dest_root" ]]; then
        echo "error: destination directory not found: $dest_root" >&2
        return 2
    fi

    # Enable Bash extended globbing behaviors.
    shopt -s nullglob dotglob

    if shopt -s globstar 2>/dev/null; then
        :
    else
        for candidate in /opt/homebrew/bin/bash /usr/local/bin/bash; do
            if [[ -x "$candidate" ]]; then
                exec "$candidate" "$0" "$@"
            fi
        done
        echo "error: this script requires 'globstar' (Bash >= 4). Install a newer bash (e.g. 'brew install bash') and re-run." >&2
        return 2
    fi

    for src in \
        "$src_root"/.env \
        "$src_root"/.env.* \
        "$src_root"/*.db \
        "$src_root"/*.pem \
        "$src_root"/*.crt \
        "$src_root"/*.key \
        "$src_root"/*.code-workspace \
        "$src_root"/.vscode/settings.json \
        "$src_root"/.vscode/launch.json \
        "$src_root"/**/.dev.* \
        "$src_root"/**/*.local \
        "$src_root"/**/*.secret* \
        "$src_root"/**/*secrets* \
        "$src_root"/**/*.secrets.*; do

        [[ -e "$src" || -L "$src" ]] || continue

        rel="${src#"$src_root"/}"
        mkdir -p "$dest_root/$(dirname "$rel")"
        cp -a "$src" "$dest_root/$rel"
        echo "copied: $rel"
    done

    return 0
}

main "$@"
