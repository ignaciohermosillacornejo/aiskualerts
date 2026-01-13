#!/bin/bash
set -euo pipefail

DATE=$(date +%Y-%m-%d)
FILENAME="backup-${DATE}.sql.gz.gpg"
BACKUP_DIR="/tmp/db-backups"

echo "Starting encrypted backup: ${FILENAME}"
mkdir -p "${BACKUP_DIR}"

# pg_dump → gzip → GPG encrypt
docker exec aiskualerts-postgres-1 pg_dump \
  -U aiskualerts \
  -d aiskualerts \
  --format=plain \
  --no-owner \
  --no-acl \
  | gzip \
  | gpg --symmetric --batch --passphrase "$BACKUP_ENCRYPTION_KEY" \
    --cipher-algo AES256 -o "${BACKUP_DIR}/${FILENAME}"

echo "Backup created: $(du -h "${BACKUP_DIR}/${FILENAME}" | cut -f1)"

# Install b2 CLI if needed
if ! command -v b2 &> /dev/null; then
  pip3 install --quiet b2
fi

# Upload to B2
b2 authorize-account "${B2_KEY_ID}" "${B2_APPLICATION_KEY}"
b2 upload-file "${B2_BUCKET_NAME}" "${BACKUP_DIR}/${FILENAME}" "daily/${FILENAME}"

# Cleanup
rm -f "${BACKUP_DIR}/${FILENAME}"
echo "Backup completed successfully!"
