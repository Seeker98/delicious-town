FROM node:22-alpine AS build
RUN npm i -g pnpm@10
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/server ./apps/server
RUN pnpm install --frozen-lockfile --filter "@dt/server..."
RUN pnpm --filter @dt/config build && pnpm --filter @dt/server build
RUN pnpm deploy --filter @dt/server --prod --legacy /out

FROM node:22-alpine
ENV NODE_ENV=production CONFIG_BUNDLE_PATH=/app/config/bundle.json
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/server/dist ./dist
COPY --from=build /repo/packages/config/generated/bundle.json ./config/bundle.json
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
