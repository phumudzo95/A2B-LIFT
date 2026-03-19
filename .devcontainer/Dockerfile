FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

# Install Node.js 20 LTS
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends curl ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get -y install --no-install-recommends nodejs \
    && npm install -g npm@latest expo-cli \
    && apt-get clean && rm -rf /var/lib/apt/lists/*
