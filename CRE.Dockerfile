# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run compile

# Final stage
FROM node:18-alpine

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/workflows ./workflows
COPY --from=builder /app/contracts ./contracts
COPY --from=builder /app/hardhat.config.ts ./
COPY --from=builder /app/package.json ./
COPY --from=builder /app/tsconfig.json ./

# Make sure state directory exists
RUN mkdir -p /app/workflow_state

# Install ts-node globally to run the workflow
RUN npm install -g ts-node typescript

ENTRYPOINT ["ts-node", "workflows/cre-backend.ts"]
