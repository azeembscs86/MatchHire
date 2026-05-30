# Git author configuration

This document is the source of truth for **who appears as a contributor** on the MatchHire GitHub repository. It exists because GitHub once showed Claude as a contributor — caused by `Co-Authored-By:` trailers in commit messages, not by the commits' real author field. The history has since been rewritten to clear that, and this guide explains how to keep it clean.

---

## 1. Current identity

| Scope | Name | Email |
|---|---|---|
| local repo (`Backend/`, `Frontend/`, `qa/`, …) | `Azeem Akram` | `azeembscs86@gmail.com` |
| global (`~/.gitconfig`) | `Azeem Akram` | `azeembscs86@gmail.com` |

Both author and committer of every commit on `main` are this identity. There are no other authors, committers, or `Co-Authored-By:` trailers in the history as of commit `caf3086` (force-pushed 2026-05-31).

---

## 2. Verify the author on any commit

```bash
# every author across the whole repo (should be one line)
git log --pretty=format:'%an <%ae>' | sort -u

# every committer across the whole repo (should be one line)
git log --pretty=format:'%cn <%ce>' | sort -u

# any Co-Authored-By trailers? (should print 0)
git log --grep='Co-Authored-By' --pretty=format:'%h' | wc -l

# current identity for THIS repo
git config user.name
git config user.email
```

The first two commands must return exactly one line: `Azeem Akram <azeembscs86@gmail.com>`.

---

## 3. Fix the identity if it changes

If a clone shows the wrong name/email for new commits, run inside the repo:

```bash
git config --local  user.name  "Azeem Akram"
git config --local  user.email "azeembscs86@gmail.com"
```

To also fix the system-wide default so new repos start correct:

```bash
git config --global user.name  "Azeem Akram"
git config --global user.email "azeembscs86@gmail.com"
```

`--local` overrides `--global` per repo, so once the local value is set, this repo is permanent until you change it.

---

## 4. Fix the identity on commits that already exist

> **This rewrites history. Coordinate with anyone else with a clone of `main`; they will need to `git fetch && git reset --hard origin/main` after the force push, or re-clone.**

Safety net first — point a backup branch at the current HEAD so you can recover if anything goes wrong:

```bash
git branch backup/pre-author-rewrite HEAD
```

Then run the rewrite. The `--env-filter` block overrides both author and committer on every commit; the `--msg-filter` strips any `Co-Authored-By:` line that names Claude / Codex / Anthropic (other co-authors survive):

```bash
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f \
  --env-filter '
    export GIT_AUTHOR_NAME="Azeem Akram"
    export GIT_AUTHOR_EMAIL="azeembscs86@gmail.com"
    export GIT_COMMITTER_NAME="Azeem Akram"
    export GIT_COMMITTER_EMAIL="azeembscs86@gmail.com"
  ' \
  --msg-filter 'grep -viE "^Co-Authored-By:.*(Claude|Codex|Anthropic|anthropic\.com|noreply@anthropic)"' \
  -- main
```

Verify (every check from §2), then publish:

```bash
git push --force-with-lease origin main
```

`--force-with-lease` is preferred over `--force` because it refuses to push if the remote moved while you were rewriting locally — protecting against accidentally clobbering a teammate's push.

> **Modern alternative:** if `git-filter-repo` is installed, use it instead — it's the maintained replacement for `filter-branch`. Same intent:
>
> ```bash
> git filter-repo --mailmap mailmap.txt \
>   --message-callback 'return re.sub(rb"^Co-Authored-By:.*(Claude|Codex|Anthropic|anthropic\.com|noreply@anthropic).*\r?\n", b"", message, flags=re.MULTILINE | re.IGNORECASE)'
> ```
>
> The `filter-branch` recipe above is the fallback when filter-repo isn't installed.

---

## 5. Prevent contributor attribution issues going forward

GitHub attributes a commit to a user account by matching the commit's **author email** (or `Co-Authored-By:` trailer email) against an email registered on a GitHub account. To keep `Azeem Akram` as the only attributed contributor:

- **Never write `Co-Authored-By:` trailers** for non-human contributors (AI assistants, tools, generators). They are valid Git trailers and GitHub renders them on the contributor list and commit pages.
- **Make sure `azeembscs86@gmail.com` is on your GitHub account** at <https://github.com/settings/emails>. Set it as primary if you want it shown; mark as "Keep my email addresses private" if you want it hidden behind the GitHub `noreply` proxy. Either way, the commit must use the GitHub-account email so the commit gets attributed to your account (not "unknown").
- **If you generate commits with an automated tool** that signs them with its own identity, run the script with the env vars overridden before the commit:
  ```bash
  GIT_AUTHOR_NAME="Azeem Akram"      \
  GIT_AUTHOR_EMAIL="azeembscs86@gmail.com" \
  GIT_COMMITTER_NAME="Azeem Akram"   \
  GIT_COMMITTER_EMAIL="azeembscs86@gmail.com" \
  <the-tool> commit -m "…"
  ```
- **Inspect every commit's author before you push.** A one-liner pre-flight check:
  ```bash
  git log origin/main..HEAD --pretty=format:'%h %an <%ae>'
  ```
  If anything other than `Azeem Akram <azeembscs86@gmail.com>` appears, fix it locally before pushing (`git commit --amend --author="Azeem Akram <azeembscs86@gmail.com>" --no-edit` for the last commit, or the `filter-branch` recipe in §4 for older ones).

---

## 6. Optional — block bad authors at the hook level

Drop the following into `.git/hooks/pre-commit` (and `chmod +x` it) to refuse any commit not authored by the configured identity:

```bash
#!/usr/bin/env bash
set -e
expected_name="Azeem Akram"
expected_email="azeembscs86@gmail.com"
actual_name=$(git config user.name)
actual_email=$(git config user.email)
if [ "$actual_name" != "$expected_name" ] || [ "$actual_email" != "$expected_email" ]; then
  echo "Refusing commit: git identity is '$actual_name <$actual_email>',"
  echo "expected '$expected_name <$expected_email>'."
  echo "Fix with:"
  echo "  git config --local user.name  \"$expected_name\""
  echo "  git config --local user.email \"$expected_email\""
  exit 1
fi
```

`.git/hooks/` is not tracked by git, so each clone needs the hook installed once. Track a copy in `tools/git-hooks/pre-commit` if you want it to live in the repo.

---

## 7. Audit history

The May 2031 rewrite (commit `caf3086`) cleared every legacy `Co-Authored-By: Claude…` trailer and updated every author / committer to `Azeem Akram <azeembscs86@gmail.com>`. The pre-rewrite state is preserved locally on the `backup/pre-author-rewrite` branch in case anyone needs the historical messages for archaeology — but that branch should never be pushed.

If you need to delete the backup branch later (after you're confident the rewrite landed cleanly on the remote and on every collaborator's clone):

```bash
git branch -D backup/pre-author-rewrite
```
