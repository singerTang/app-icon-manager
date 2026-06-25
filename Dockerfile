# 应用 icon 管理端 - 生产镜像
# 多阶段构建：builder 负责安装/编译 better-sqlite3 原生依赖，runtime 仅保留运行所需

# ---- 构建阶段 ----
FROM node:20-slim AS builder
WORKDIR /app
# better-sqlite3 在缺少预编译包时需要以下工具链来本地编译
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
# 先装依赖，利用层缓存（仅生产依赖）
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- 运行阶段 ----
FROM node:20-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
# 复制已安装好的生产依赖（含编译后的原生模块）与应用源码
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY server.js db.js ./
COPY public ./public
# 数据库与上传目录，运行时通过 volume 挂载实现持久化
RUN mkdir -p data uploads
EXPOSE 3000
CMD ["node", "server.js"]
