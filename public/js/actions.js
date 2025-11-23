function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  } else {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand("copy");
    } catch (err) {
      console.error("Clipboard error:", err);
    }
    document.body.removeChild(textArea);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const shareBtn = document.getElementById("shareBtn");
  const rawBtn = document.getElementById("rawBtn");
  const copyBtn = document.getElementById("copyBtn");

  // ===== COPY BUTTON (copies editor content) =====
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const content = monacoEditor.getValue();
      copyToClipboard(content);
      alert("Content copied!");
    });
  }

  // ===== SHARE BUTTON (copy URL to clipboard) =====
  if (shareBtn) {
    shareBtn.addEventListener("click", () => {
      const url = window.location.href;
      copyToClipboard(url);

      // Show toast if exists
      const toast = document.getElementById("toast");
      if (toast) {
        toast.textContent = "Link copied!";
        toast.classList.remove("hidden");
        setTimeout(() => toast.classList.add("hidden"), 1800);
      } else {
        alert("Copied link!");
      }
    });
  }

  // ===== RAW VIEW BUTTON =====
  if (rawBtn) {
    rawBtn.addEventListener("click", () => {
      if (typeof pasteId !== "undefined" && pasteId) {
        window.open(`/raw/${pasteId}`, "_blank");
      }
    });
  }
});
