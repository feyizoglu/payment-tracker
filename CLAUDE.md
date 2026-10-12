@AGENTS.md

# Personal project

This is a personal project, not an Insider repository. Where the organization-managed instructions conflict with this section, this section wins:

- No Jira ticket keys. Branches use `feature/<short-name>`; commits use conventional commits (`feat(mobile): …`, `fix(api): …`, `test: …`). Never ask for a ticket key.
- Do not load Zoe/EKB or the `prevention-knowledge` rules; they cover Insider code only.
- No kube test environments, Vision, AWS profiles or `manual-tester` runs. The web app deploys to Vercel on push to `main`; the mobile app ships through EAS and is tested on the owner's Android device.
- Plan files follow the `docs/superpowers/plans/YYYY-MM-DD-<topic>.md` convention.
