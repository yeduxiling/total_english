# 前端开发环境 Dockerfile
FROM node:20-alpine

WORKDIR /app

# 先复制 package 文件安装依赖（利用 Docker 缓存层）
COPY package.json package-lock.json* ./
RUN npm install

# 复制源码
COPY . .

EXPOSE 5173

# Vite dev server，--host 0.0.0.0 让容器外可访问
CMD ["npx", "vite", "--host", "0.0.0.0"]
