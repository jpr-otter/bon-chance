# Multi-stage build for Rust service
FROM rust:1.75-slim as builder

# Install dependencies
RUN apt-get update && apt-get install -y pkg-config libssl-dev

WORKDIR /app

# Copy workspace files
COPY ../Cargo.toml ../Cargo.lock ./
COPY ../shared ../shared

# Copy service-specific files
COPY Cargo.toml ./
COPY src ./src
COPY migrations ./migrations

# Build the application
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the binary from builder stage
COPY --from=builder /app/target/release/user-service ./user-service
COPY --from=builder /app/migrations ./migrations

EXPOSE 3001

CMD ["./user-service"]