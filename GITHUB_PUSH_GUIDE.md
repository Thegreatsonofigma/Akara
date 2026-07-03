# Akara GitHub Push Guide

This local branch is ready:

```bash
codex/dynamic-listing-cards
```

The push failed because this Mac is not authenticated with GitHub for the HTTPS remote.

## Best Fix: GitHub CLI

Install GitHub CLI:

```bash
brew install gh
```

Sign in:

```bash
gh auth login
```

Choose:

```text
GitHub.com
HTTPS
Login with a web browser
```

After login, push:

```bash
cd "/Users/STEVEN/Documents/New project/akara"
git push -u origin codex/dynamic-listing-cards
```

## Alternative: Personal Access Token

Create a fine-grained GitHub token with access to `Thegreatsonofigma/Akara`.

Required permission:

```text
Contents: Read and write
```

Then push:

```bash
cd "/Users/STEVEN/Documents/New project/akara"
git push -u origin codex/dynamic-listing-cards
```

When Git asks for a username, use your GitHub username.
When Git asks for a password, paste the token.

## Alternative: SSH

If SSH is already set up with GitHub:

```bash
cd "/Users/STEVEN/Documents/New project/akara"
git remote set-url origin git@github.com:Thegreatsonofigma/Akara.git
git push -u origin codex/dynamic-listing-cards
```

## Fallback: Patch File

If pushing from this Mac is not possible yet, send the patch file to another developer.

They can apply it with:

```bash
cd their-akara-repo
git checkout -b codex/dynamic-listing-cards
git am /path/to/akara-unpushed-commits.patch
git push -u origin codex/dynamic-listing-cards
```

## Current Commits Waiting To Push

```text
d938251 feat: add verification success card
0704b74 fix: embed approved Coolvetica number fonts
0c6f567 fix: match Akara card logo layouts
897521b fix: use compressed heavy font for card numbers
921cec3 feat: add exchange completion cards
3df2381 feat: add dynamic listing share cards
3bac86f chore: clean Akara repository ignores
```
