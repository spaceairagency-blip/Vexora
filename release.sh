#!/usr/bin/env bash
# Usage (in Codespaces): ./release.sh 2.0.1   -> tags and pushes; GitHub Actions does the rest
set -e
[ -n "$1" ] || { echo "usage: ./release.sh <version>"; exit 1; }
git tag "v$1" && git push origin HEAD "v$1"
