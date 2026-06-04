# Stage 1: Build the React app
FROM node:20-slim AS build

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn config set network-timeout 600000 -g && \
    yarn install --frozen-lockfile --network-timeout 600000

COPY public/ ./public/
COPY src/ ./src/

# Build-time env vars baked into the JS bundle (relative paths for nginx proxy)
ENV REACT_APP_BACKEND_URL=/api
ENV REACT_APP_API_BASE_URL=/api
ENV REACT_APP_TITILER_URL=/tiles
ENV REACT_APP_APP_NAME=DWB
ENV REACT_APP_VERSION=1.0.0
ENV REACT_APP_ENVIRONMENT=production
ENV NODE_OPTIONS=--max_old_space_size=4096

RUN yarn build

# Stage 2: Serve with nginx
FROM nginx:1.27-alpine

RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/nginx.conf

COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
