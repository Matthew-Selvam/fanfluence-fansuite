FROM node:22-slim

WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/tsconfig*.json ./apps/server/
COPY apps/server/src ./apps/server/src

RUN npm install --include=dev
RUN npm run build -w @fanfluence/server

EXPOSE 4317
ENV FANFLUENCE_MODE=production
ENV FANFLUENCE_HOST=0.0.0.0
ENV FANFLUENCE_PORT=4317
ENV FANFLUENCE_ALLOW_LAN=true
ENV FANFLUENCE_DATA_DIR=/data
ENV NODE_ENV=production

CMD ["node", "apps/server/dist/boot.js"]