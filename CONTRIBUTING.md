# Contributing
We love your input! We want to make contributing to this project as easy and transparent as possible, whether it's:

    - Reporting a bug
    - Discussing the current state of the code
    - Submitting a fix
    - Proposing new features
    - Becoming a maintainer

## We Develop with Github
We use github to host code, to track issues and feature requests, as well as accept pull requests.

## We Use [Github Flow](https://guides.github.com/introduction/flow/index.html), So All Code Changes Happen Through Pull Requests
Pull requests are the best way to propose changes to the codebase (we use [Github Flow](https://guides.github.com/introduction/flow/index.html)). We actively welcome your pull requests:

  1. Fork the repo and create your branch from `master`.
  1. Make sure your code [lints](#Use a Consistent Coding Style).
  1. Issue that pull request!

## Report bugs using Github's [issues](https://github.com/spdx/spdx-license-diff/issues/new)
We use GitHub issues to track public bugs. Report a bug by [opening a new issue](https://github.com/spdx/spdx-license-diff/issues/new); it's that easy!

## Get coding!
[Start here](DEVELOPERS.md)

## Use a Consistent Coding Style

- [JavaScript Standard Style](https://standardjs.com/) - We use [eslint](https://eslint.org/) and provide a [config file](.eslintrc.js).
- Use SPDX-License-Identifiers:
  - The SPDX license identifier shall be added at the first possible line in a file which can contain a comment.
  - `// SPDX-License-Identifier: (GPL-3.0-or-later AND Apache-2.0)
`

## License
We are initially [GPL-3.0-or-later](LICENSE) but will move to Apache-2.0 as soon as we [refactor the stackoverflow code](#7).

By contributing, you agree that your contributions will be dual licensed under ([GPL-3.0-or-later](https://spdx.org/licenses/GPL-3.0-or-later.html) AND [Apache-2.0](https://spdx.org/licenses/Apache-2.0.html)). You also agree to the [Developer Certificate of Origin](https://developercertificate.org/) so  please [Sign-Off](https://stackoverflow.com/questions/1962094/what-is-the-sign-off-feature-in-git-for) your commits: `git commit -s`.

## References
This document was based on a template by [briandk](https://gist.github.com/briandk/3d2e8b3ec8daf5a27a62) adapted from the open-source contribution guidelines for [Facebook's Draft](https://github.com/facebook/draft-js/blob/a9316a723f9e918afde44dea68b5f9f39b7d9b00/CONTRIBUTING.md)
