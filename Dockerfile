FROM mcr.microsoft.com/playwright:v1.40.0-focal

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies (using npm install instead of ci)
RUN npm install --production

# Copy app files
COPY . .

# Create user
RUN groupadd -r pwuser && useradd -r -g pwuser pwuser \
    && chown -R pwuser:pwuser /app

USER pwuser

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "server.js"]
