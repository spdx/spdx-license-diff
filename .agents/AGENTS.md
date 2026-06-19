# SPDX License Diff - Development Standards

## Commit and PR Guidelines
* **Atomicity:** Always split modifications into small, single-purpose branches and pull requests.
* **Title Lengths:** Keep all Git commit subject lines and GitHub Pull Request titles strictly **under 50 characters**.
* **Conventional Commits:** Follow the conventional commits format (e.g., `feat(worker): ...`, `fix(bg): ...`, `test: ...`, `chore: ...`, `ci: ...`).

## License Compliance
* Every new configuration, test, or source file must include the proper SPDX header on the very first possible comment line to satisfy the REUSE compliance checks:
  * For configuration/scripts (e.g., Babel, ESLint):
    ```javascript
    // SPDX-FileCopyrightText: Alan D. Tse <alandtse@gmail.com>
    // SPDX-License-Identifier: CC0-1.0
    ```
  * For source/test files:
    ```javascript
    // SPDX-FileCopyrightText: Alan D. Tse <alandtse@gmail.com>
    // SPDX-License-Identifier: (GPL-3.0-or-later AND Apache-2.0)
    ```

## ESLint Standards
* Do not use `/* eslint-env */` comments since the project uses flat ESLint configs (ESLint 9+), which do not support them. Define environments and globals in `eslint.config.mjs` under specific file blocks instead.

## CI Workflow Patterns
* Run PR validation in isolated, dry steps (e.g., `yarn test:unit` for unit tests, `yarn lint` for code style, and compile Chrome only via `yarn build chrome` to verify Webpack compliance) instead of building and packaging all browsers.
* Add unit testing (`yarn test:unit`) to the release pipeline in `semantic-release.yml` prior to publication.
