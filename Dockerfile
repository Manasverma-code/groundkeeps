FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY turbo.json tsconfig.base.json ./
COPY packages/ ./packages/

RUN npm ci
RUN npm run build

FROM node:22-alpine AS proxy
WORKDIR /app
COPY --from=builder /app /app
EXPOSE 3000
CMD ["node", "--experimental-specifier-resolution=node", "packages/trust-proxy/dist/start.js"]

FROM node:22-alpine AS dashboard
WORKDIR /app
COPY --from=builder /app /app
EXPOSE 5173
CMD ["npx", "vite", "--host", "0.0.0.0", "--port", "5173"]
WORKDIR /app/packages/dashboard
