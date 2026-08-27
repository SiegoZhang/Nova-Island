# Nova Island frontend — Next.js standalone
FROM node:24-alpine AS deps
WORKDIR /app

# 国内构建可传：--build-arg NPM_REGISTRY=https://registry.npmmirror.com
ARG NPM_REGISTRY=
COPY package.json package-lock.json ./
RUN if [ -n "$NPM_REGISTRY" ]; then npm config set registry "$NPM_REGISTRY"; fi \
    && npm ci

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# rewrite / CSP 在构建时读入 next.config；compose 内网主机名为 backend
ARG API_INTERNAL_BASE_URL=http://backend:8000/api/v1
# 仅 HTTPS 正式站开启；本地 http://localhost 必须保持 false
ARG ENABLE_HTTPS_SECURITY_HEADERS=false
ENV API_INTERNAL_BASE_URL=$API_INTERNAL_BASE_URL
ENV ENABLE_HTTPS_SECURITY_HEADERS=$ENABLE_HTTPS_SECURITY_HEADERS
ENV NEXT_PUBLIC_API_BASE_URL=/api/v1
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_PUBLIC_API_BASE_URL=/api/v1

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
