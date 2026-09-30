#!/bin/bash
set -a
. ../../.env 2>/dev/null
. ./.env 2>/dev/null
set +a

NODE_ENV=${NODE_ENV:-development} npx nodemon --signal SIGTERM --delay 1 --exec ts-node src/index.ts
