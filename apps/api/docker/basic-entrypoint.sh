#!/bin/sh
set -eu

redis-server \
  --bind 127.0.0.1 \
  --port 6379 \
  --save "" \
  --appendonly no \
  --daemonize yes

SEARXNG_SETTINGS_PATH=/etc/searxng/settings.yml \
  /opt/searxng-venv/bin/python -m searx.webapp &

for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:8080/search?q=healthcheck&format=json" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

exec node dist/src/index.js
