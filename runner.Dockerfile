FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git jq ca-certificates \
    sudo nodejs npm \
    libicu72 liblttng-ust1 libssl3 zlib1g \
    && rm -rf /var/lib/apt/lists/*

# Create runner user
RUN useradd -m -s /bin/bash runner && \
    echo "runner ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

WORKDIR /home/runner

# Download the GitHub Actions runner
RUN curl -fsSL https://github.com/actions/runner/releases/download/v2.311.0/actions-runner-linux-x64-2.311.0.tar.gz \
    | tar xz && \
    chown -R runner:runner /home/runner

# Install runner .NET dependencies
RUN ./bin/installdependencies.sh

# Copy entrypoint and fix line endings (in case of Windows CRLF)
COPY entrypoint.sh /home/runner/entrypoint.sh
RUN sed -i 's/\r$//' /home/runner/entrypoint.sh && \
    chmod +x /home/runner/entrypoint.sh && \
    chown runner:runner /home/runner/entrypoint.sh

USER runner

ENTRYPOINT ["/home/runner/entrypoint.sh"]
