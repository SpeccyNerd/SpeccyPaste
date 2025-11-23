require(["vs/editor/editor.main"], function () {
  const expiryInfoEl = document.getElementById("expiryInfo");

  // Extract pasteId from URL
  const pathParts = window.location.pathname.split("/");
  const pasteId = pathParts[1] === "p" ? pathParts[2] : null;

  window.__hideSensitive__ = true;
  let decorations = [];

  // ===============================
  // PREVENT DOUBLE SAVE ON DESKTOP
  // ===============================
  window.addEventListener("DOMContentLoaded", () => {
    if (window.innerWidth > 768) {
      const mobBtn = document.getElementById("mobileSaveBtn");
      if (mobBtn) mobBtn.remove();
    }
  });

  const ipTokenRegex =
    /\b\d{1,3}(?:\.\d{1,3}){3}\b|(?:token|api[_-]?key|authorization)[:=]?\s*["']?[a-z0-9\-_\.]{16,}["']?/gi;

  function redactContent(content) {
    return content.replace(ipTokenRegex, "⛔ sensitive data");
  }

  function updateDecorations() {
    const model = monacoEditor.getModel();
    if (!model) return;

    if (decorations.length > 0) {
      decorations = monacoEditor.deltaDecorations(decorations, []);
    }

    const code = model.getValue();
    const matches = [...code.matchAll(ipTokenRegex)];

    const newDecorations = matches.map(match => {
      const start = model.getPositionAt(match.index);
      const end = model.getPositionAt(match.index + match[0].length);

      return {
        range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
        options: {
          inlineClassName: window.__hideSensitive__
            ? "fogged-token unselectable-token"
            : "highlight-token",
          afterContentClassName: window.__hideSensitive__ ? "fogged-token-after" : undefined,
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      };
    });

    decorations = monacoEditor.deltaDecorations([], newDecorations);
  }

  function showPasswordOverlay(onSubmit) {
    const overlay = document.getElementById("passwordOverlay");
    const unlockBtn = document.getElementById("submitPassword");
    const input = document.getElementById("passwordInput");

    overlay.style.display = "flex";

    unlockBtn.onclick = async () => {
      const pw = input.value;
      if (!pw) return;
      try {
        await onSubmit(pw);
        overlay.style.display = "none";
      } catch {
        alert("Incorrect password.");
      }
    };
  }

  async function loadPasteContent(id, lang, redacted, expires) {
    const rawRes = await fetch(`/raw/${id}`);
    const code = await rawRes.text();
    renderEditor(code, lang, redacted, expires);
  }

  function renderEditor(code, lang, redacted, expires) {
    window.__hideSensitive__ = !!redacted;

    monacoEditor = monaco.editor.create(document.getElementById("editor"), {
      value: code,
      language: lang,
      theme: "vs-dark",
      fontSize: 14,
      lineNumbers: "on",
      automaticLayout: true,
      scrollBeyondLastLine: true,
      readOnly: true,
    });

    updateDecorations();

    const toggle = document.getElementById("toggleSensitive");
    const icon = document.getElementById("sensitiveIcon");

    if (toggle && icon) {
      toggle.disabled = true;
      toggle.style.cursor = "not-allowed";
      icon.classList.remove("fa-eye", "fa-lock");
      icon.classList.add(redacted ? "fa-lock" : "fa-eye");
    }

    if (expires && expiryInfoEl) {
      const expiresMs = Number(expires);
      startTimer(expiresMs, expiryInfoEl);

      const dropdown = document.getElementById("expiry");
      if (dropdown && !Number.isNaN(expiresMs)) {
        const minsLeft = Math.max(
          1,
          Math.round((expiresMs - Date.now()) / 60000)
        );

        let chosen = dropdown.options[dropdown.options.length - 1].value;
        for (let option of dropdown.options) {
          const v = parseInt(option.value, 10);
          if (!Number.isNaN(v) && v >= minsLeft) {
            chosen = option.value;
            break;
          }
        }
        dropdown.value = chosen;
      }
    }

    document.getElementById("saveBtn")?.classList.add("hidden");
    document.getElementById("mobileSaveBtn")?.classList.add("hidden");

    document.getElementById("language").disabled = true;
    document.getElementById("expiry").disabled = true;
    document.getElementById("language").value = lang;
  }

  async function savePaste() {
    let content = monacoEditor.getValue();
    const lang = document.getElementById("language").value;
    const expiry = document.getElementById("expiry").value;
    const redacted = window.__hideSensitive__;
    const passwordInput = document.getElementById("pastePassword");
    const password = passwordInput ? passwordInput.value : "";

    if (redacted) content = redactContent(content);

    try {
      const res = await fetch("/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          language: lang,
          expiry,
          redacted,
          password,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.key) {
        alert("Failed to save paste");
        return;
      }

      window.location.href = `/p/${json.key}`;
    } catch (err) {
      console.error("Error saving paste:", err);
      alert("Something went wrong while saving.");
    }
  }

  // ===============================
  // SAVE BUTTONS
  // ===============================
  document.getElementById("saveBtn")?.addEventListener("click", savePaste);
  document.getElementById("mobileSaveBtn")?.addEventListener("click", savePaste);

  // ===============================
  // SETTINGS / PASSWORD DROPDOWN
  // ===============================
  const settingsDropdown = document.getElementById("settingsDropdown");

  function updateSettingsOptions() {
    const dropdown = document.getElementById("settingsDropdown");
    const pastePasswordInput = document.getElementById("pastePassword");
    if (!dropdown || !pastePasswordInput) return;

    dropdown.innerHTML = `
      <option value="">Options</option>
      <option value="add-password">${
        pastePasswordInput.value ? "Unset Password" : "Add Password"
      }</option>
    `;
  }

  settingsDropdown?.addEventListener("change", () => {
    const dropdown = document.getElementById("settingsDropdown");
    const pastePasswordInput = document.getElementById("pastePassword");
    if (!dropdown || !pastePasswordInput) return;

    if (dropdown.value === "add-password") {
      if (pastePasswordInput.value) {
        if (confirm("Remove password?")) pastePasswordInput.value = "";
      } else {
        const pw = prompt("Enter password:");
        if (pw) pastePasswordInput.value = pw;
      }
      updateSettingsOptions();
    }
    dropdown.value = "";
  });

  // Call once DOM is fully loaded so elements exist
  window.addEventListener("load", updateSettingsOptions);

  // ===============================
  // TOOLBAR VISIBILITY (new vs saved)
  // ===============================
  if (!pasteId) {
    // NEW paste page: hide Copy / Share / Raw
    document.getElementById("rawBtn")?.classList.add("hidden");
    document.getElementById("copyBtn")?.classList.add("hidden");
    document.getElementById("shareBtn")?.classList.add("hidden");
  } else {
    // VIEWING a saved paste: show everything
    document.getElementById("rawBtn")?.classList.remove("hidden");
    document.getElementById("copyBtn")?.classList.remove("hidden");
    document.getElementById("shareBtn")?.classList.remove("hidden");
  }

  // ===============================
  // SHARE BUTTON + TOAST
  // ===============================
  const shareBtn = document.getElementById("shareBtn");
  const toast = document.getElementById("toast");

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;

    const toolbar = document.querySelector(".toolbar");
    if (toolbar) {
      const rect = toolbar.getBoundingClientRect();
      toast.style.position = "absolute";
      toast.style.top = rect.bottom + 10 + "px";
      toast.style.left = rect.left + "px";
    }

    toast.classList.remove("hidden");
    setTimeout(() => toast.classList.add("hidden"), 1800);
  }

  if (shareBtn) {
    shareBtn.addEventListener("click", () => {
      const url = window.location.href;
      navigator.clipboard
        .writeText(url)
        .then(() => showToast("Link copied!"))
        .catch(() => alert("Could not copy link."));
    });
  }

  // ===============================
  // VIEW MODE
  // ===============================
  if (pasteId) {
    document.getElementById("settingsDropdown")?.classList.add("hidden");
    document.getElementById("pastePassword")?.classList.add("hidden");
    document.getElementById("toggleSensitive")?.classList.add("hidden");

    fetch(`/meta/${pasteId}`)
      .then(res => res.json())
      .then(async (meta) => {
        const { language, redacted, expires, passwordHash } = meta;

        if (passwordHash) {
          showPasswordOverlay(async (pw) => {
            const res = await fetch(`/raw/${pasteId}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ password: pw }),
            });

            if (!res.ok) throw new Error("Wrong password");

            const code = await res.text();
            renderEditor(code, language || "plaintext", redacted, expires);
          });
        } else {
          loadPasteContent(
            pasteId,
            language || "plaintext",
            redacted || false,
            expires
          );
        }
      })
      .catch(() => {
        document.getElementById("editor").innerText =
          "// Failed to load paste or incorrect password.";
      });

    return;
  }

  // ===============================
  // NEW PASTE MODE
  // ===============================
  monacoEditor = monaco.editor.create(document.getElementById("editor"), {
    value: "// Paste your code here...",
    language: "plaintext",
    theme: "vs-dark",
    fontSize: 14,
    lineNumbers: "on",
    automaticLayout: true,
    scrollBeyondLastLine: true,
  });

  monacoEditor.onDidChangeModelContent(updateDecorations);

  document.getElementById("language").addEventListener("change", function () {
    monaco.editor.setModelLanguage(monacoEditor.getModel(), this.value);
  });

  const toggleBtn = document.getElementById("toggleSensitive");
  const icon = document.getElementById("sensitiveIcon");

  const hiddenState = document.getElementById("redactionState");
  if (hiddenState) hiddenState.value = window.__hideSensitive__;

  toggleBtn?.addEventListener("click", () => {
    window.__hideSensitive__ = !window.__hideSensitive__;

    const stateInput = document.getElementById("redactionState");
    if (stateInput) stateInput.value = window.__hideSensitive__;

    icon.classList.remove("fa-eye", "fa-lock");
    icon.classList.add(window.__hideSensitive__ ? "fa-lock" : "fa-eye");

    updateDecorations();
  });
});
