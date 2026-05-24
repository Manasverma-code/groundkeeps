FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json .npmrc tsconfig.base.json turbo.json ./
COPY packages/license-server ./packages/license-server
COPY keys ./keys
RUN npm ci && npm run build --workspace=@trust-layer/license-server

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/packages/license-server/dist ./dist
COPY --from=builder /app/packages/license-server/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY keys ./keys
EXPOSE 3001
CMD ["node", "dist/index.js"]
