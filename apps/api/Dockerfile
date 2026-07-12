FROM node:22-alpine

WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@11.12.0 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api

RUN pnpm install --frozen-lockfile --filter @scholametric/api...

WORKDIR /workspace/apps/api

EXPOSE 3000

CMD ["pnpm", "start:dev"]
