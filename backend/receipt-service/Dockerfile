# Multi-stage build for Rust service
FROM rust:1.75-slim as builder

RUN apt-get update && apt-get install -y pkg-config libssl-dev

WORKDIR /app

# Copy workspace files
COPY ../Cargo.toml ../Cargo.lock ./
COPY ../shared ../shared

# Copy service-specific files
COPY Cargo.toml ./
COPY src ./src
COPY migrations ./migrations

RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/target/release/receipt-service ./receipt-service
COPY --from=builder /app/migrations ./migrations

EXPOSE 3002

CMD ["./receipt-service"]