# 后端开发环境 Dockerfile
FROM node:20-alpine

WORKDIR /app

# 安装 better-sqlite3 编译依赖（Alpine 需要）
RUN apk add --no-cache python3 make g++

# 先复制 package 文件安装依赖（利用 Docker 缓存层）
COPY package.json package-lock.json* ./
RUN npm install

# 复制源码
COPY . .

# 创建数据目录
RUN mkdir -p /app/data

EXPOSE 3001

# 使用 tsx watch 实现热重载
CMD ["npx", "tsx", "watch", "src/index.ts"]
