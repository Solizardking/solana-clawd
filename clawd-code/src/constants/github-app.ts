export const PR_TITLE = 'Add Clawd Code GitHub Workflow'

export const GITHUB_ACTION_SETUP_DOCS_URL =
  'https://github.com/Solizardking/solana-clawd/blob/main/docs/github-action.md'

export const WORKFLOW_CONTENT = `name: Clawd Code

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
  issues:
    types: [opened, assigned]
  pull_request_review:
    types: [submitted]

jobs:
  clawd:
    if: |
      (github.event_name == 'issue_comment' && contains(github.event.comment.body, '@clawd')) ||
      (github.event_name == 'pull_request_review_comment' && contains(github.event.review_comment.body, '@clawd')) ||
      (github.event_name == 'pull_request_review' && contains(github.event.review.body, '@clawd')) ||
      (github.event_name == 'issues' && (contains(github.event.issue.body, '@clawd') || contains(github.event.issue.title, '@clawd')))
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
      issues: read
      id-token: write
      actions: read
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - name: Run Clawd Code
        id: clawd
        uses: solizardking/clawd-code-action@v1
        with:
          xai_api_key: \${{ secrets.XAI_API_KEY }}

          # Optional: Allow Clawd to read CI results on PRs
          additional_permissions: |
            actions: read

          # Optional: Give a custom prompt. If not specified, Clawd performs the instructions from the comment.
          # prompt: 'Update the pull request description to include a summary of changes.'

          # Optional: Add clawd-code args to customize behavior
          # See https://github.com/Solizardking/solana-clawd for available options
          # clawd_args: '--allowed-tools Bash(gh pr:*)'

`

export const PR_BODY = `## 🤖 Installing Clawd Code GitHub Workflow

This PR adds a GitHub Actions workflow that enables Clawd Code integration in our repository.

### What is Clawd Code?

[Clawd Code](https://github.com/Solizardking/solana-clawd) is a Solana-native AI coding agent that can help with:
- Bug fixes and improvements  
- Documentation updates
- Implementing new features
- Code reviews and suggestions
- Writing tests
- Perpetuals trading on Phoenix DEX
- And more!

### How it works

Once this PR is merged, we'll be able to interact with Clawd by mentioning @clawd in a pull request or issue comment.

### Important Notes

- **This workflow won't take effect until this PR is merged**
- **@clawd mentions won't work until after the merge is complete**
- The workflow runs automatically whenever Clawd is mentioned in PR or issue comments
- Clawd gets access to the entire PR or issue context including files, diffs, and previous comments

### Security

- Our xAI API key is securely stored as a GitHub Actions secret
- Only users with write access to the repository can trigger the workflow
- All Clawd runs are stored in the GitHub Actions run history
- Clawd's default tools are limited to reading/writing files and interacting with our repo

There's more information in the [Clawd Code repo](https://github.com/Solizardking/solana-clawd).

After merging this PR, let's try mentioning @clawd in a comment on any PR to get started!`

export const CODE_REVIEW_PLUGIN_WORKFLOW_CONTENT = `name: Clawd Code Review

on:
  pull_request:
    types: [opened, synchronize, ready_for_review, reopened]
    # Optional: Only run on specific file changes
    # paths:
    #   - "src/**/*.ts"
    #   - "src/**/*.tsx"

jobs:
  clawd-review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
      issues: read
      id-token: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - name: Run Clawd Code Review
        id: clawd-review
        uses: solizardking/clawd-code-action@v1
        with:
          xai_api_key: \${{ secrets.XAI_API_KEY }}
          prompt: 'Review this pull request for bugs, security issues, and code quality.'
`