# GitHub Enhancements — Retry Failed Builds

A Chrome extension that adds a **Retry** button directly on GitHub PR pages next to each failed GitHub Actions check.

Instead of clicking through to the Actions run page, finding "Re-run failed jobs", and confirming — just click **Retry** right from the PR.

## Installation

1. Clone this repo (or download as ZIP)
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked** and select this folder

## How It Works

- Detects failed GitHub Actions checks on PR pages using a `MutationObserver` (works with GitHub's SPA navigation)
- Injects a small "Retry" button in the action bar of each failed check row
- On click, fetches a scoped CSRF token from the Actions run page, then triggers GitHub's internal re-run endpoint — the same one used by the "Re-run failed jobs" button in the Actions UI
- Only targets GitHub Actions checks (skips third-party CI like Bugbot, CodeQL, etc.)
- Uses your existing GitHub session — no PAT or OAuth token needed

## Architecture

**Manifest V3** content script running in `MAIN` world (the page's own JS context). This is intentional — MAIN world scripts execute as part of the page itself, so `fetch` calls to `github.com` are same-origin with session cookies automatically included. No background service worker or special permissions are needed.

## Button States

| State | Appearance | Duration |
|-------|-----------|----------|
| Default | Red outlined "Retry" | — |
| Loading | Muted "Retrying..." | Until response |
| Success | Green "Retried!" | Resets after 5s |
| Error | Red filled "Failed" (hover for details) | Resets after 3s |

## Limitations

- Only works on `github.com` (not GitHub Enterprise — though adding your GHE domain to `manifest.json` matches would work)
- Requires you to be logged in to GitHub
- Third-party CI checks (anything without an `/actions/runs/` link) are skipped since they don't use GitHub's re-run mechanism

## File Structure

```
├── manifest.json        # Manifest V3 config
├── src/
│   ├── content.js       # DOM observation, button injection, retry logic
│   └── styles.css       # Primer-matching button styles
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Security

- **No tokens stored**: Uses your existing GitHub session cookies (httpOnly, handled by the browser) and fetches scoped CSRF tokens on demand
- **No external requests**: All communication is same-origin to `github.com`
- **No permissions**: The extension requests zero Chrome permissions — it only runs a content script on PR pages
- **DOM-safe**: All UI elements are created via `document.createElement` / `textContent` — no `innerHTML` usage
