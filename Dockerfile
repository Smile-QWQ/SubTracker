FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci

COPY . .

RUN npm run prisma:generate -w apps/api \
  && npm run build -w packages/shared \
  && npm run build -w apps/api \
  && npm prune --omit=dev

FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY docker/entrypoint.sh /usr/local/bin/subtracker-entrypoint.sh

RUN apk add --no-cache tzdata \
  && chmod +x /usr/local/bin/subtracker-entrypoint.sh \
  && mkdir -p /app/data /app/apps/api/storage/logos

EXPOSE 3001

CMD ["/usr/local/bin/subtracker-entrypoint.sh"]
