RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy and install dependencies
COPY package*.json ./
RUN npm install

# Copy app files
COPY . .

# Create user for Puppeteer
RUN groupadd -r pptruser && useradd -r -g pptruser pptruser \
    && mkdir -p /home/pptruser/.cache/puppeteer \
    && chown -R pptruser:pptruser /home/pptruser \
    && chown -R pptruser:pptruser /app

USER pptruser

ENV NODE_ENV=production
ENV PORT=8080
ENV PUPPETEER_CACHE_DIR=/home/pptruser/.cache/puppeteer

EXPOSE 8080

CMD ["node", "server.js"]
