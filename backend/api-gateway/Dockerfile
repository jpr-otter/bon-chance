FROM rust:1.75-slim as builder

RUN apt-get update && apt-get install -y pkg-config libssl-dev

WORKDIR /app

COPY Cargo.toml ./
COPY src ./src

RUN cargo build --release

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/target/release/api-gateway ./api-gateway

EXPOSE 3000

CMD ["./api-gateway"]