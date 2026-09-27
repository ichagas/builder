# Onboarding sandbox job (spec 007, epic B3, WP-BE6, T141).
#
# Build from the REPO ROOT (not this directory), so the shared,
# dependency-free detection/generation logic can be copied straight from
# `app/backend/src/services/onboarding/sandbox/` — one file, one behavior,
# on both sides of the boundary (see that directory's detect.ts docstring):
#
#   docker build -f infra/onboarding-sandbox/Dockerfile -t pronghorn-onboarding-sandbox:local .
#
# Non-root, minimal base image. Read-only by design: this container clones
# shallow, single-branch checkouts into its own filesystem, reads them, and
# never pushes or writes back to the repositories it inspects. It never
# bakes in a long-lived credential — every credential it uses is handed to
# it as an environment variable of the one job execution/container run that
# needs it (see jobDispatcher.ts and src/clone.ts's docstrings).

FROM node:20-alpine AS builder
WORKDIR /build

COPY infra/onboarding-sandbox/package.json infra/onboarding-sandbox/tsconfig.json ./
RUN npm install --no-audit --no-fund

COPY infra/onboarding-sandbox/src ./src
# Shared, dependency-free logic — copied, not duplicated (see detect.ts's
# docstring in app/backend for why this is a Dockerfile COPY rather than an
# npm package or a workspace reference).
COPY app/backend/src/services/onboarding/sandbox/detect.ts ./src/detect.ts
COPY app/backend/src/services/onboarding/sandbox/generateManifest.ts ./src/generateManifest.ts

RUN npm run build && npm prune --omit=dev

FROM node:20-alpine
# git: the only extra OS package this image needs, for the shallow clone
# (src/clone.ts shells out to the `git` binary rather than a git library, so
# there is no long-lived native dependency to keep patched beyond the distro
# package itself).
RUN apk add --no-cache git=~2 && \
    addgroup -S sandbox && adduser -S sandbox -G sandbox

WORKDIR /app
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/dist ./dist
COPY infra/onboarding-sandbox/package.json ./

# HOME is required by git for its (empty, unused) global config lookup;
# /app is writable by `sandbox` for its own temp clone directories
# (os.tmpdir() defaults to /tmp, already writable by any user in this image).
ENV HOME=/app
USER sandbox

ENTRYPOINT ["node", "dist/entrypoint.js"]
