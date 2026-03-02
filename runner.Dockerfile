FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git jq ca-certificates gnupg zip \
    sudo \
    libicu72 liblttng-ust1 libssl3 zlib1g \
    python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20 (copied from host to avoid corporate SSL issues)
COPY node20.tar.gz /tmp/node20.tar.gz
RUN tar xz -C /usr/local --strip-components=1 -f /tmp/node20.tar.gz && \
    rm /tmp/node20.tar.gz && \
    node --version && npm --version

# Install Azure CLI
RUN pip3 install --break-system-packages --no-cache-dir azure-cli

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
