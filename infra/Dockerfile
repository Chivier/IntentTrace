FROM node:26.5.1-bookworm-slim@sha256:9e6f9357d371591e32ab6f2d8a26d63bdd0d17c29eee3f4f3e7e454d9634bf73

ENV COREPACK_HOME=/opt/corepack \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.18.0 --activate

COPY --chown=node:node . .
RUN pnpm install --frozen-lockfile --prod=false && pnpm build
RUN mkdir -p /var/lib/intenttrace/artifacts && chown -R node:node /var/lib/intenttrace

USER node
