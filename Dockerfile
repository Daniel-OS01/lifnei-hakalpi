# Stage 1: build the static site.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# SKIP_APP_BUILD=1 is for verifying the nginx image on its own: it takes a ready dist/
# from the build context and only precompresses it, without running the data pipeline.
ARG SKIP_APP_BUILD=0
RUN if [ "$SKIP_APP_BUILD" = "1" ]; then \
      test -d dist && npm run precompress; \
    else \
      npm run build; \
    fi

# Stage 2: serve with nginx as the non-root nginx user on port 8080.
FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
CMD ["nginx", "-g", "daemon off;"]
