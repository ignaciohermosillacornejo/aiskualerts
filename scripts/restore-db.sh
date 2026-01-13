#!/bin/bash
set -euo pipefail

# Load secrets from env file (not passed via command line for security)
if [[ -f /tmp/restore-secrets.env ]]; then
  source /tmp/restore-secrets.env
fi

# Validate required environment variables
: "${B2_KEY_ID:?Environment variable B2_KEY_ID is required}"
: "${B2_APPLICATION_KEY:?Environment variable B2_APPLICATION_KEY is required}"
: "${B2_BUCKET_NAME:?Environment variable B2_BUCKET_NAME is required}"
: "${BACKUP_ENCRYPTION_KEY:?Environment variable BACKUP_ENCRYPTION_KEY is required}"
: "${BACKUP_FILE:?Environment variable BACKUP_FILE is required}"

# Configuration
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-aiskualerts-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-aiskualerts}"
POSTGRES_DB="${POSTGRES_DB:-aiskualerts}"

BACKUP_DIR="/tmp/db-restore"
mkdir -p "${BACKUP_DIR}"

# Install b2 CLI if needed
if ! command -v b2 &> /dev/null; then
  echo "Installing Backblaze B2 CLI..."
  pip3 install --quiet b2
fi

echo "Authorizing with B2..."
b2 authorize-account "${B2_KEY_ID}" "${B2_APPLICATION_KEY}"

# Determine which file to download
if [ "$BACKUP_FILE" = "latest" ]; then
  echo "Finding latest backup..."
  BACKUP_FILE=$(b2 ls "${B2_BUCKET_NAME}" daily/ | sort -r | head -1 | awk '{print $NF}')
  BACKUP_FILE=$(basename "$BACKUP_FILE")
  if [[ -z "$BACKUP_FILE" ]]; then
    echo "Error: No backup files found in B2 bucket"
    exit 1
  fi
fi

echo "Downloading: daily/${BACKUP_FILE}"
b2 download-file-by-name "${B2_BUCKET_NAME}" "daily/${BACKUP_FILE}" "${BACKUP_DIR}/${BACKUP_FILE}"

echo "Decrypting and restoring to database..."
gpg --decrypt --batch --passphrase "$BACKUP_ENCRYPTION_KEY" "${BACKUP_DIR}/${BACKUP_FILE}" \
  | gunzip \
  | docker exec -i "${POSTGRES_CONTAINER}" psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"

# Cleanup
rm -f "${BACKUP_DIR}/${BACKUP_FILE}"
echo "Restore completed successfully!"
