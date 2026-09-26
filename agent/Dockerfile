FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
EXPOSE 4000
CMD ["npx", "tsx", "src/index.ts"]
