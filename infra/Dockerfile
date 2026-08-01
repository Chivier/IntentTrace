FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d

ENV COREPACK_HOME=/opt/corepack \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.18.0 --activate

COPY --chown=node:node . .
RUN pnpm install --frozen-lockfile --prod=false && pnpm build
RUN mkdir -p /var/lib/intenttrace/artifacts && chown -R node:node /var/lib/intenttrace

USER node
