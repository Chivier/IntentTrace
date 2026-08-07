FROM node:24.18.1-bookworm-slim@sha256:235600a8101ab264e117b1768e925532262668dc9b581ef1dd7d96ced463b8e7

ENV COREPACK_HOME=/opt/corepack \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.18.0 --activate

COPY --chown=node:node . .
RUN pnpm install --frozen-lockfile --prod=false && pnpm build
RUN mkdir -p /var/lib/intenttrace/artifacts && chown -R node:node /var/lib/intenttrace

USER node
