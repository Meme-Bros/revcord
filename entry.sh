#!/bin/sh

echo "Setting up environment..."
touch /app/revcord.sqlite

if [ -f /app/.env ]; then
    echo "Environment file already exists"
else

    if [ -z "${DISCORD_TOKEN}" ]; then
        echo "DISCORD_TOKEN is not set"
        exit 1
    fi

    if [ -z "${REVOLT_TOKEN}" ]; then
        echo "REVOLT_TOKEN is not set"
        exit 1
    fi
    echo "Creating environment file"
    touch /app/.env
    echo "DISCORD_TOKEN=${DISCORD_TOKEN}" > /app/.env
    echo "REVOLT_TOKEN=${REVOLT_TOKEN}" >> /app/.env
    echo "API_URL=${API_URL:-https://api.revolt.chat}" >> /app/.env
    echo "REVOLT_ATTACHMENT_URL=${REVOLT_ATTACHMENT_URL:-https://autumn.revolt.chat}" >> /app/.env
fi

echo "Starting Revcord..."

npm start