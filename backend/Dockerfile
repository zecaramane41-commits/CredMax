FROM node:20-alpine
WORKDIR /msu/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY shared /msu/shared
COPY backend/src ./src
ENV NODE_ENV=production
EXPOSE 8000
CMD ["node", "src/server.js"]
