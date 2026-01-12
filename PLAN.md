# Development Plan & Workflow

## PR Workflow (MANDATORY)

When creating or updating a Pull Request, Claude MUST follow this workflow:

### 1. After Creating/Updating a PR
- **Always wait for CI checks** using `gh pr checks <PR#> --watch`
- Do not proceed until all checks pass
- If checks fail, fix the issues and push again

### 2. Review Cycle
- After CI passes, check for reviewer comments: `gh pr view <PR#> --comments`
- If reviewer requests changes:
  1. Read and understand all comments
  2. Address each comment with code changes
  3. Commit and push the fixes
  4. Wait for CI checks again with `gh pr checks <PR#> --watch`
  5. Repeat until reviewer approves

### 3. Merge Criteria
- All CI checks must pass
- Reviewer must have approved (no pending "changes requested")
- Only then ask user if they want to merge

### Example Commands
```bash
# Watch CI checks (blocks until complete)
gh pr checks 25 --watch

# View PR comments
gh pr view 25 --comments

# Check review status
gh pr view 25 --json reviews

# After fixing, push and re-check
git push && gh pr checks 25 --watch
```
