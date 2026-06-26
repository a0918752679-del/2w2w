FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json .npmrc ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
RUN mkdir -p data
EXPOSE 8080
CMD ["npm", "start"]
