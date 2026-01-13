#!/bin/bash
set -euo pipefail

# Load secrets from env file (not passed via command line for security)
if [[ -f /tmp/backup-secrets.env ]]; then
  source /tmp/backup-secrets.env
fi

# Validate required environment variables
: "${B2_KEY_ID:?Environment variable B2_KEY_ID is required}"
: "${B2_APPLICATION_KEY:?Environment variable B2_APPLICATION_KEY is required}"
: "${B2_BUCKET_NAME:?Environment variable B2_BUCKET_NAME is required}"
: "${BACKUP_ENCRYPTION_KEY:?Environment variable BACKUP_ENCRYPTION_KEY is required}"

# Configuration
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-aiskualerts-db}"
POSTGRES_USER="${POSTGRES_USER:-aiskualerts}"
POSTGRES_DB="${POSTGRES_DB:-aiskualerts}"

DATE=$(date +%Y-%m-%d)
FILENAME="backup-${DATE}.sql.gz.gpg"
BACKUP_DIR="/tmp/db-backups"

echo "Starting encrypted backup: ${FILENAME}"
mkdir -p "${BACKUP_DIR}"

# Clean up any existing backup file from failed runs
rm -f "${BACKUP_DIR}/${FILENAME}"

# pg_dump → gzip → GPG encrypt
docker exec "${POSTGRES_CONTAINER}" pg_dump \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  --format=plain \
  --no-owner \
  --no-acl \
  | gzip \
  | gpg --symmetric --batch --passphrase "$BACKUP_ENCRYPTION_KEY" \
    --cipher-algo AES256 -o "${BACKUP_DIR}/${FILENAME}"

echo "Backup created: $(du -h "${BACKUP_DIR}/${FILENAME}" | cut -f1)"

# Install b2 CLI if needed
if ! command -v b2 &> /dev/null; then
  echo "Installing Backblaze B2 CLI..."
  pip3 install --quiet b2
fi

# Upload to B2
echo "Uploading to B2..."
b2 authorize-account "${B2_KEY_ID}" "${B2_APPLICATION_KEY}"
b2 upload-file "${B2_BUCKET_NAME}" "${BACKUP_DIR}/${FILENAME}" "daily/${FILENAME}"

# Cleanup
rm -f "${BACKUP_DIR}/${FILENAME}"
echo "Backup completed successfully!"
