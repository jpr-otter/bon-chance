FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Expose port
EXPOSE 4200

# Start development server
CMD ["npm", "start", "--", "--host", "0.0.0.0", "--port", "4200"]