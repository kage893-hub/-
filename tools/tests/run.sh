#!/bin/sh
# 回帰テスト11本をまとめて流す。先にサーバーを立てておく： npx http-server -p 8123 -s -c-1 .
# 使い方: sh tools/tests/run.sh [スクリーンショットの出力先]   （出力先の既定は /tmp/leopa-tests）
# 環境変数: CHROME（Chromium のパス）、PLAYWRIGHT（playwright モジュールのパス）、BASE（既定 http://localhost:8123）
OUT=${1:-/tmp/leopa-tests}
mkdir -p "$OUT"
cd "$(dirname "$0")"
for t in first kids2 pairfast card expo3 img nutrition study family behavior movement; do
  echo "== $t"
  if node "$t.js" "$OUT" > "$OUT/$t.log" 2>&1; then
    tail -3 "$OUT/$t.log"
  else
    tail -25 "$OUT/$t.log"
    exit 1
  fi
done
