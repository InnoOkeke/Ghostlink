FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --include=dev

COPY src ./src
COPY examples ./examples
COPY tsconfig.json tsconfig.ui.json vite.config.ts postcss.config.js tailwind.config.js ./

RUN npm run build && npm install @modelcontextprotocol/server-github --no-save --include=dev && mkdir -p /app/outputs

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/api/server.js"]
