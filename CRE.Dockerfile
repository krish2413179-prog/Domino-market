# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run compile

FROM node:18-alpine

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/workflows ./workflows
COPY --from=builder /app/package.json ./
COPY --from=builder /app/tsconfig.json ./

RUN npm install -g ts-node typescript

ENTRYPOINT ["ts-node", "workflows/cre/server.ts"]
