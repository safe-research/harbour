# ---- Base Image ----
# Use a specific, slim version of Node for reproducibility and a smaller image.
FROM node:22-slim as base
WORKDIR /usr/src/app

# ---- Builder Stage ----
# This stage builds the TypeScript source code into JavaScript.
FROM base as builder

# First, copy over package files and install all dependencies.
# This includes devDependencies needed for the build process (e.g., typescript).
COPY package.json package-lock.json* ./
RUN npm install

# Then, copy over the rest of the source code and build the project.
# The .dockerignore file will prevent node_modules on the host from being copied.
COPY . .
RUN npm run build

# ---- Production Stage ----
# This stage creates the final, lean image for running the application.
FROM base as runner

# Copy package.json and install *only* production dependencies.
# This avoids including devDependencies in the final image, keeping it small.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copy the compiled code and package.json from the builder stage.
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/package.json ./

# Specify the command to run the compiled worker.
CMD [ "node", "dist/worker.js" ]
