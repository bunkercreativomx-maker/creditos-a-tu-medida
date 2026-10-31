# Imagen de producción para Coolify (Next.js standalone).
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
ARG NEXT_PUBLIC_PB_URL=https://creditos-pb.bunkeragent.cloud
ARG NEXT_PUBLIC_WHATSAPP_NUMBER=526563748899
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY=BGmxd6cI5SFI_VNC-KfXeiejqkpp4YW28BuDUEA5t7Yi9LuYhEz48V8Tzl3Yvj9F7CouGnJJNyLNlUlZ_JUAEf0
ARG NEXT_PUBLIC_META_PIXEL_ID=1401885575462193
ARG NEXT_PUBLIC_FB_DOMAIN_VERIFICATION=k700d1rvuyi63yl0tvri5tbojr9tex
ARG SOURCE_COMMIT=
ENV NEXT_PUBLIC_PB_URL=$NEXT_PUBLIC_PB_URL \
    NEXT_PUBLIC_WHATSAPP_NUMBER=$NEXT_PUBLIC_WHATSAPP_NUMBER \
    NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY \
    NEXT_PUBLIC_META_PIXEL_ID=$NEXT_PUBLIC_META_PIXEL_ID \
    NEXT_PUBLIC_FB_DOMAIN_VERIFICATION=$NEXT_PUBLIC_FB_DOMAIN_VERIFICATION \
    NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx next build --webpack

FROM node:22-alpine
WORKDIR /app
ARG SOURCE_COMMIT=
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1 SOURCE_COMMIT=$SOURCE_COMMIT
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
