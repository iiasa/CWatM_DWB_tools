# ============================================================
# Stage 1: Install Node.js dependencies (cached layer)
# ============================================================
FROM node:20-slim AS deps

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# ============================================================
# Stage 2: Build NestJS application
# ============================================================
FROM node:20-slim AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json yarn.lock tsconfig.json nest-cli.json ./
COPY src/ ./src/

RUN yarn build

# ============================================================
# Stage 3: Production runtime (Node.js + Python)
# ============================================================
FROM node:20-slim AS runtime

# System dependencies for Python, native packages (netCDF4, HDF5), and rasterio (tile generation)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    libhdf5-dev \
    libnetcdf-dev \
    libgdal-dev \
    pkg-config \
    gcc \
    g++ \
    curl \
    tini \
    && rm -rf /var/lib/apt/lists/*

# Ensure 'python' command resolves (scripts use 'python', not 'python3')
RUN ln -sf /usr/bin/python3 /usr/bin/python

# Non-root user for security
RUN groupadd --gid 1001 dwb && \
    useradd --uid 1001 --gid dwb --shell /bin/bash --create-home dwb

WORKDIR /app

# Install Python dependencies in a virtual environment
COPY python/requirements.txt /app/python/requirements.txt
RUN python -m venv /app/.venv && \
    /app/.venv/bin/pip install --no-cache-dir --upgrade pip && \
    /app/.venv/bin/pip install --no-cache-dir -r /app/python/requirements.txt

# Venv python (with all deps) takes priority over system python
ENV PATH="/app/.venv/bin:$PATH"

# Production Node.js dependencies only
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production && yarn cache clean

# Compiled NestJS application
COPY --from=build /app/dist ./dist

# Python scripts (called as subprocesses from NestJS)
COPY python/ ./python/

# Directories for data mount and python cache
RUN mkdir -p /app/data /app/python/cache && \
    chown -R dwb:dwb /app

USER dwb

# Runtime defaults
ENV NODE_ENV=production \
    PORT=8085 \
    DATA_DIR=/app/data

EXPOSE 8085

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8085/ || exit 1

# tini as PID 1 for proper signal handling in cluster mode
ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/main"]
