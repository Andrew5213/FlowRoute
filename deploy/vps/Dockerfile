FROM node:20-alpine

ENV NODE_ENV=production PORT=3000
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.mjs ./server.mjs
COPY dist ./dist
COPY deploy/vps/migrate/import.mjs ./deploy/vps/migrate/import.mjs

USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
