# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-alpine AS dev
WORKDIR /app
ENV NODE_ENV=development
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3100
CMD ["npm", "run", "start:dev"]

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["npm", "run", "start:prod"]
