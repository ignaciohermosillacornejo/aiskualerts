#!/bin/bash

# Install git hooks for the project

echo "Installing git hooks..."

# Copy pre-commit hook
cp .githooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit

echo "✅ Git hooks installed successfully!"
echo ""
echo "The following hooks are now active:"
echo "  - pre-commit: Runs lint and unit tests before each commit"
echo ""
echo "To skip hooks (not recommended), use: git commit --no-verify"
