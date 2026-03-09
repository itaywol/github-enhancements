(function () {
  "use strict";

  const RETRY_ATTR = "data-gh-retry";
  const DEBOUNCE_MS = 200;

  let debounceTimer = null;

  function parseRunId(href) {
    const match = href.match(/\/actions\/runs\/(\d+)/);
    return match ? match[1] : null;
  }

  function getRepoPath(href) {
    const match = href.match(
      /(?:https?:\/\/github\.com)?\/([^/]+\/[^/]+)\/actions\/runs\//
    );
    return match ? match[1] : null;
  }

  function getPrNumber() {
    const match = window.location.pathname.match(/\/pull\/(\d+)/);
    return match ? match[1] : null;
  }

  async function fetchRerunToken(repoPath, runId) {
    const res = await fetch(`/${repoPath}/actions/runs/${runId}`, {
      credentials: "same-origin",
      headers: { Accept: "text/html" },
    });
    if (!res.ok) throw new Error(`Failed to load run page: HTTP ${res.status}`);
    const html = await res.text();
    const match = html.match(
      /rerequest_check_suite[\s\S]*?authenticity_token["\s]*value="([^"]+)"/
    );
    if (match) return match[1];
    const fallback = html.match(
      /authenticity_token["\s]*value="([^"]+)"/
    );
    if (fallback) return fallback[1];
    const meta = html.match(/csrf-token["\s]*content="([^"]+)"/);
    return meta ? meta[1] : null;
  }

  async function retryRun(repoPath, runId, button) {
    const prNumber = getPrNumber();
    if (!prNumber) {
      setButtonState(button, "error", "Could not determine PR number");
      return;
    }

    setButtonState(button, "loading");

    try {
      const csrfToken = await fetchRerunToken(repoPath, runId);
      if (!csrfToken) {
        setButtonState(button, "error", "No CSRF token found — are you logged in?");
        return;
      }

      const url = `/${repoPath}/actions/runs/${runId}/rerequest_check_suite?pr=${prNumber}`;
      const body = new URLSearchParams({
        _method: "put",
        authenticity_token: csrfToken,
        only_failed_check_runs: "true",
      });

      const res = await fetch(url, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      if (res.ok) {
        setButtonState(button, "success");
      } else {
        setButtonState(button, "error", `HTTP ${res.status}`);
      }
    } catch (err) {
      setButtonState(button, "error", err.message);
    }
  }

  function setButtonState(button, state, errorMsg) {
    button.classList.remove(
      "gh-retry-loading",
      "gh-retry-success",
      "gh-retry-error"
    );
    button.disabled = false;
    button.title = "";

    switch (state) {
      case "loading":
        button.textContent = "Retrying\u2026";
        button.classList.add("gh-retry-loading");
        button.disabled = true;
        break;
      case "success":
        button.textContent = "Retried!";
        button.classList.add("gh-retry-success");
        button.disabled = true;
        setTimeout(() => setButtonState(button, "default"), 5000);
        break;
      case "error":
        button.textContent = "Failed";
        button.classList.add("gh-retry-error");
        button.title = errorMsg || "Unknown error";
        setTimeout(() => setButtonState(button, "default"), 3000);
        break;
      default:
        button.textContent = "Retry";
        break;
    }
  }

  function createRetryButton(repoPath, runId) {
    const btn = document.createElement("button");
    btn.className = "gh-retry-btn";
    btn.textContent = "Retry";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      retryRun(repoPath, runId, btn);
    });
    return btn;
  }

  function processChecks() {
    const failingGroups = document.querySelectorAll(
      '[role="group"][aria-label="failing checks"]'
    );

    for (const group of failingGroups) {
      const items = group.querySelectorAll("li");

      for (const item of items) {
        if (item.hasAttribute(RETRY_ATTR)) continue;

        const titleLink = item.querySelector('a[href*="/actions/runs/"]');
        if (!titleLink) {
          item.setAttribute(RETRY_ATTR, "skip");
          continue;
        }

        const href = titleLink.getAttribute("href");
        const runId = parseRunId(href);
        const repoPath = getRepoPath(href);
        if (!runId || !repoPath) continue;

        item.setAttribute(RETRY_ATTR, runId);

        const visibleItems = item.querySelector(
          '[class*="VisibleItems-module__Box"]'
        );
        if (visibleItems) {
          const btn = createRetryButton(repoPath, runId);
          visibleItems.appendChild(btn);
        }
      }
    }
  }

  function scheduleProcess() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(processChecks, DEBOUNCE_MS);
  }

  const observer = new MutationObserver(scheduleProcess);
  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener("turbo:load", scheduleProcess);
  document.addEventListener("pjax:end", scheduleProcess);

  scheduleProcess();
})();
