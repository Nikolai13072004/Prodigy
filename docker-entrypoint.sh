#!/bin/sh
set -e

mkdir -p /app/data /app/public/uploads /app/public/branding
chown -R nextjs:nextjs /app/data /app/public/uploads /app/public/branding

exec su nextjs -s /bin/sh -c 'exec "$@"' docker-entrypoint "$@"
