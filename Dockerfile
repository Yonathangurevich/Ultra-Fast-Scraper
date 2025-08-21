FROM mcr.microsoft.com/playwright:v1.45.0-focal

WORKDIR /app

COPY package.json ./
RUN npm install
COPY . .

ENV NODE_ENV=production
ENV PORT=8080
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

EXPOSE 8080

CMD ["node", "server.js"]
