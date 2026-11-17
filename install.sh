#!/usr/bin/env bash
set -eo pipefail

archive_url='https://codeload.github.com/HuberTRoy/DraftFerry/tar.gz/refs/heads/main'
platform=codex
dest=
force=0
install_deps=1
download_dir=
stage=

cleanup() {
  [[ -z "$download_dir" ]] || rm -rf -- "$download_dir"
  [[ -z "$stage" ]] || rm -rf -- "$stage"
}
trap cleanup EXIT

usage() {
  cat <<'USAGE'
Usage: install.sh [--platform codex|claude|hermes|openclaw] [--dest DIRECTORY]
                  [--force] [--skip-npm-install]

Installs DraftFerry for Codex by default. Use --dest to set the skill directory.
Use --force to update an installed DraftFerry skill and keep its local settings.

  curl -fsSL https://raw.githubusercontent.com/HuberTRoy/DraftFerry/main/install.sh | bash
USAGE
}

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

while (($#)); do
  case "$1" in
    --platform|--dest)
      [[ $# -ge 2 && -n "$2" && "$2" != --* ]] || fail "$1 requires a value."
      if [[ "$1" == --platform ]]; then platform="$2"; else dest="$2"; fi
      shift
      ;;
    --force) force=1 ;;
    --skip-npm-install) install_deps=0 ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Unknown option: $1. Use --help for usage." ;;
  esac
  shift
done

case "$platform" in
  codex) host_root="${CODEX_HOME:-${HOME:+$HOME/.codex}}" ;;
  claude) host_root="${CLAUDE_HOME:-${HOME:+$HOME/.claude}}" ;;
  hermes) host_root="${HERMES_HOME:-${HOME:+$HOME/.hermes}}" ;;
  openclaw) host_root="${OPENCLAW_HOME:-${HOME:+$HOME/.openclaw}}" ;;
  *) fail 'Choose codex, claude, hermes, or openclaw with --platform.' ;;
esac
if [[ -z "$dest" ]]; then
  [[ -n "$host_root" ]] || fail 'Set HOME or provide --dest DIRECTORY.'
  dest="$host_root/skills/draftferry"
fi

if ((install_deps)); then
  command -v node >/dev/null && command -v npm >/dev/null ||
    fail 'Node.js 22 or newer and npm are required. Use --skip-npm-install for a file-only install.'
  node -e 'if (Number(process.versions.node.split(".")[0]) < 22) process.exit(1)' ||
    fail 'DraftFerry requires Node.js 22 or newer.'
fi
command -v tar >/dev/null || fail 'tar is required to install DraftFerry.'

source_file="${BASH_SOURCE[0]:-}"
source_dir=
if [[ -n "$source_file" && -f "$source_file" ]]; then
  source_dir="$(cd -- "$(dirname -- "$source_file")" && pwd -P)/skills/draftferry"
fi
if [[ ! -f "$source_dir/SKILL.md" ]]; then
  command -v curl >/dev/null || fail 'curl is required to download DraftFerry.'
  download_dir="$(mktemp -d "${TMPDIR:-/tmp}/draftferry-download.XXXXXX")"
  printf '%s\n' 'Downloading DraftFerry...'
  curl --fail --silent --show-error --location --output "$download_dir/bundle.tar.gz" "$archive_url" ||
    fail 'Could not download the DraftFerry archive.'
  tar -xzf "$download_dir/bundle.tar.gz" --strip-components=1 -C "$download_dir" ||
    fail 'Could not extract the DraftFerry archive.'
  source_dir="$download_dir/skills/draftferry"
fi

bundle_files=(SKILL.md .env.example package.json package-lock.json agents scripts references platforms draftferry-setup draftferry-check)
for file in "${bundle_files[@]}"; do
  [[ -e "$source_dir/$file" ]] || fail "The DraftFerry bundle is missing $file."
done
[[ -f "$source_dir/../../LICENSE" ]] || fail 'The DraftFerry bundle is missing LICENSE.'

dest="${dest%/}"
[[ -n "$dest" && "$dest" != / ]] || fail 'Choose a skill directory for --dest.'
parent="$(dirname -- "$dest")"
mkdir -p -- "$parent"
parent="$(cd -- "$parent" && pwd -P)"
name="$(basename -- "$dest")"
[[ "$name" != . && "$name" != .. ]] || fail 'Choose a named skill directory for --dest.'
dest="$parent/$name"
[[ ! -L "$dest" ]] || fail 'Choose a destination directory rather than a symbolic link.'
if [[ -e "$dest" ]]; then
  [[ -d "$dest" ]] || fail "The destination is not a directory: $dest"
  [[ -z "$(ls -A -- "$dest")" ]] || {
    ((force)) || fail "Destination already exists: $dest. Use --force to update an installed copy."
    [[ -f "$dest/SKILL.md" ]] && grep -qx 'name: draftferry' "$dest/SKILL.md" ||
      fail "The destination is not an installed DraftFerry skill: $dest"
  }
fi
[[ "$(cd -- "$source_dir" && pwd -P)" != "$dest" ]] ||
  fail 'The source and installation directories must be separate.'

stage="$(mktemp -d "$parent/.draftferry-install.XXXXXX")"
# Copy the bundle without local credentials, profiles, artifacts, or dependencies.
(
  cd -- "$source_dir"
  tar --exclude='.env' --exclude='.env.*' --exclude='*.local.json' \
    --exclude='artifacts' --exclude='node_modules' --exclude='.DS_Store' \
    -cf - SKILL.md package.json package-lock.json agents scripts references platforms draftferry-setup draftferry-check
) | tar -xf - -C "$stage"
cp -- "$source_dir/.env.example" "$stage/.env.example"
cp -- "$source_dir/../../LICENSE" "$stage/LICENSE"

if ((install_deps)); then
  printf '%s\n' 'Installing runtime dependencies...'
  (cd -- "$stage" && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --no-audit --no-fund) ||
    fail 'Dependency installation failed. Fix npm access or use --skip-npm-install.'
fi

mkdir -p -- "$dest"
for file in "${bundle_files[@]}" LICENSE; do
  cp -R -- "$stage/$file" "$dest/"
done
if ((install_deps)); then
  # Keep the old dependencies until the new lockfile install is ready.
  if [[ -e "$dest/node_modules" || -L "$dest/node_modules" ]]; then
    mv -- "$dest/node_modules" "$stage/previous-node_modules"
  fi
  if ! mv -- "$stage/node_modules" "$dest/node_modules"; then
    if [[ -e "$stage/previous-node_modules" || -L "$stage/previous-node_modules" ]]; then
      mv -- "$stage/previous-node_modules" "$dest/node_modules" || {
        printf 'Previous dependencies are available at %s\n' "$stage/previous-node_modules" >&2
        stage=
      }
    fi
    fail 'Could not install the new dependencies into the destination.'
  fi
fi

printf 'Installed DraftFerry to %s\n' "$dest"
if ((!install_deps)); then
  printf '%s\n' 'Run npm ci in the installed directory before using DraftFerry.'
fi
printf '%s\n' 'Ask your agent to use DraftFerry Setup to configure the platforms you want.'
