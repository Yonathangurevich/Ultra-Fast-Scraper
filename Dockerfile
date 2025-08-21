FROM mcr.microsoft.com/playwright:v1.40.0-focal

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies WITHOUT --production flag
RUN npm install

# Copy app files
COPY . .

# The playwright image already has a pwuser, so we'll just use it
# No need to create a new user

ENV NODE_ENV=production
ENV PORT=8080
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

EXPOSE 8080

CMD ["node", "server.js"]
