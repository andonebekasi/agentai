# Dockerfile for NanoClaw
FROM node:22-bookworm-slim

# Install system runtime & build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    ca-certificates \
    python3 \
    make \
    g++ \
    tini \
    && rm -rf /var/lib/apt/lists/*

# Enable and prepare pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Clone latest NanoClaw from official upstream
RUN git clone --depth 1 https://github.com/nanocoai/nanoclaw.git /app

# Install dependencies and build TypeScript
RUN pnpm install
RUN pnpm run build

# Runtime configurations
ENV NODE_ENV=production
ENV DATA_DIR=/app/data
ENV PORT=3000

# Create persistent data directory
RUN mkdir -p /app/data

COPY docker/nanoclaw/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

VOLUME ["/app/data"]

EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
CMD ["node", "dist/index.js"]
