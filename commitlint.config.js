export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Types allowed in commit messages
    "type-enum": [
      2,
      "always",
      [
        "feat",     // new feature
        "fix",      // bug fix
        "docs",     // documentation only
        "style",    // formatting, missing semicolons, etc
        "refactor", // code change that isn't a fix or feature
        "perf",     // performance improvement
        "test",     // adding/updating tests
        "build",    // build system or deps
        "ci",       // CI config
        "chore",    // other changes that don't modify src or test
        "revert",   // reverts a previous commit
      ],
    ],
    "subject-case": [2, "always", "lower-case"],
    "subject-max-length": [2, "always", 72],
    "body-max-line-length": [2, "always", 100],
  },
};
