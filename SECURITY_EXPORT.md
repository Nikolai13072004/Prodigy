# Sanitized GitHub export

This repository was created from a clean source snapshot instead of copying the
original Git history. The export intentionally omits internal GitLab CI/deployment
configuration, environment-specific infrastructure documentation, generated audit
artifacts, and presentation exports with personal document metadata.

No local `.env`, database, uploads, build output, test output, or dependency
directories are included. Configure deployment hosts and credentials through an
untracked `.env` or the GitHub environment/secrets settings. The values in
`.env.example` are placeholders only.
