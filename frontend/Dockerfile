FROM node:18-alpine as build

WORKDIR /app

# Copy package files first to leverage Docker cache for dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy only the necessary source code
COPY components/ components/
COPY services/ services/
COPY utils/ utils/
COPY App.tsx index.html index.tsx types.ts tsconfig.json vite.config.ts ./

# Build the app
RUN npm run build

# Serve stage
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
