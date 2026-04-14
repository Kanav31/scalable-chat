# Single Dockerfile used by all 3 backend services.
# Each Fly.io app sets START_SCRIPT to the correct entry point.

FROM node:18-alpine

WORKDIR /app

# Copy package files first — Docker caches this layer.
# If only source files change, npm install is skipped on next build (faster deploys).
COPY package*.json ./
RUN npm ci --only=production

COPY . .

# START_SCRIPT is overridden per Fly app:
#   threads-socket  → socketservice.js
#   threads-db      → dbinsertionKafka.js
#   threads-fetch   → fetchService.js
ENV START_SCRIPT=socketservice.js

CMD node $START_SCRIPT
