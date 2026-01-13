#!/bin/bash
set -euo pipefail

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
fi

echo "Downloading: daily/${BACKUP_FILE}"
b2 download-file-by-name "${B2_BUCKET_NAME}" "daily/${BACKUP_FILE}" "${BACKUP_DIR}/${BACKUP_FILE}"

echo "Decrypting and restoring to database..."
gpg --decrypt --batch --passphrase "$BACKUP_ENCRYPTION_KEY" "${BACKUP_DIR}/${BACKUP_FILE}" \
  | gunzip \
  | docker exec -i aiskualerts-postgres-1 psql -U aiskualerts -d aiskualerts

# Cleanup
rm -f "${BACKUP_DIR}/${BACKUP_FILE}"
echo "Restore completed successfully!"
