FROM node:22-alpine

WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@11.12.0 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web

RUN pnpm install --frozen-lockfile --filter @scholametric/web...

WORKDIR /workspace/apps/web

EXPOSE 5173

CMD ["pnpm", "dev", "--", "--host"]
