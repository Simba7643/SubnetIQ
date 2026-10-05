FROM node:24-alpine AS build
WORKDIR /app
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY apps/web/package.json ./apps/web/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY packages/netcalc/package.json ./packages/netcalc/package.json
COPY packages/shared/package.json ./packages/shared/package.json
ENV HUSKY=0
RUN pnpm install --frozen-lockfile
COPY . .
ARG VITE_API_URL=
ARG VITE_SUPABASE_URL=
ARG VITE_SUPABASE_ANON_KEY=
ARG VITE_SITE_URL=http://localhost:8080
ARG VITE_APP_NAME=SubnetIQ
ARG VITE_ANALYTICS_PROVIDER=none
ARG VITE_ANALYTICS_DOMAIN=
ARG VITE_ANALYTICS_SCRIPT_URL=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_SITE_URL=$VITE_SITE_URL
ENV VITE_APP_NAME=$VITE_APP_NAME
ENV VITE_ANALYTICS_PROVIDER=$VITE_ANALYTICS_PROVIDER
ENV VITE_ANALYTICS_DOMAIN=$VITE_ANALYTICS_DOMAIN
ENV VITE_ANALYTICS_SCRIPT_URL=$VITE_ANALYTICS_SCRIPT_URL
RUN pnpm build:packages
RUN pnpm --filter @subnetiq/web build

FROM nginx:stable-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT []
CMD ["nginx", "-g", "daemon off;"]
