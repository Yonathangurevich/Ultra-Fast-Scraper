FROM mcr.microsoft.com/playwright:v1.40.0-focal

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies WITHOUT --production flag
# Playwright needs to download browsers during install
RUN npm install

# Copy app files
COPY . .

# Create user
RUN groupadd -r pwuser && useradd -r -g pwuser pwuser \
    && chown -R pwuser:pwuser /app

USER pwuser

ENV NODE_ENV=production
ENV PORT=8080
# Skip browser download - we already have it in the image
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

EXPOSE 8080

CMD ["node", "server.js"]
