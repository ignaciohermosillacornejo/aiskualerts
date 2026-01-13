// Commitlint configuration for conventional commits
// https://www.conventionalcommits.org/
// https://commitlint.js.org/

export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Type must be one of the conventional types
    "type-enum": [
      2,
      "always",
      [
        "feat", // New feature
        "fix", // Bug fix
        "docs", // Documentation only changes
        "style", // Code style changes (formatting, etc)
        "refactor", // Code refactoring
        "perf", // Performance improvements
        "test", // Adding or updating tests
        "build", // Build system or external dependencies
        "ci", // CI/CD configuration changes
        "chore", // Maintenance tasks
        "revert", // Reverting previous commits
      ],
    ],
    // Type is required and must be lowercase
    "type-case": [2, "always", "lower-case"],
    "type-empty": [2, "never"],
    // Subject is required
    "subject-empty": [2, "never"],
    // Subject should not end with period
    "subject-full-stop": [2, "never", "."],
    // Subject should be lowercase
    "subject-case": [2, "always", "lower-case"],
    // Header max length (type + scope + subject)
    "header-max-length": [2, "always", 100],
    // Body max line length
    "body-max-line-length": [2, "always", 200],
    // Footer max line length
    "footer-max-line-length": [2, "always", 200],
  },
};
