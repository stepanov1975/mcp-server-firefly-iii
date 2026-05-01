# Use a lightweight Node.js image
FROM node:20-alpine

# Set the working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy the rest of the application code
COPY index.js ./
COPY src ./src

# Expose the port (only relevant for SSE mode)
# Default to 3001, though it can be overridden at runtime
EXPOSE 3001

# Set environment variables
ENV NODE_ENV=production

# Start the server
# Note: To use SSE, provide a PORT environment variable.
# For stdio, do not provide a PORT (or set it to empty).
CMD ["node", "index.js"]
