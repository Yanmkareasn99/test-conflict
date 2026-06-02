import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";

const state = {
  file: null,
  previewUrl: null,
  pdfDocument: null,
  renderedPdfCanvases: [],
};

const elements = {
  form: document.querySelector("#ocr-form"),
  dropZone: document.querySelector("#drop-zone"),
  fileInput: document.querySelector("#file-input"),
  languageSelect: document.querySelector("#language-select"),
  pageRange: document.querySelector("#page-range"),
  recognizeButton: document.querySelector("#recognize-button"),
  clearButton: document.querySelector("#clear-button"),
  copyButton: document.querySelector("#copy-button"),
  downloadButton: document.querySelector("#download-button"),
  fileName: document.querySelector("#file-name"),
  previewFrame: document.querySelector("#preview-frame"),
  progressBar: document.querySelector("#progress-bar"),
  statusText: document.querySelector("#status-text"),
  resultText: document.querySelector("#result-text"),
};

const PDF_WORKER_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;

elements.fileInput.addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (file) {
    loadFile(file);
  }
});

["dragenter", "dragover"].forEach((eventName) => {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove("dragging");
  });
});

elements.dropZone.addEventListener("drop", (event) => {
  const [file] = event.dataTransfer.files;
  if (file) {
    elements.fileInput.files = event.dataTransfer.files;
    loadFile(file);
  }
});

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.file) {
    return;
  }

  try {
    setBusy(true);
    setStatus("Preparing OCR engine…");
    setProgress(4);

    const languages = getSelectedLanguages().join("+");
    const sources = await getOcrSources();
    const results = [];

    for (let index = 0; index < sources.length; index += 1) {
      const source = sources[index];
      const result = await recognizeSource(source, languages, index, sources.length);
      results.push(result.trim());
    }

    const combinedText = results.filter(Boolean).join("\n\n--- Page break ---\n\n");
    elements.resultText.value = combinedText || "No text was detected.";
    elements.copyButton.disabled = !combinedText;
    elements.downloadButton.disabled = !combinedText;
    setStatus(`Complete. Processed ${sources.length} source${sources.length === 1 ? "" : "s"}.`);
    setProgress(100);
  } catch (error) {
    setStatus(error.message || "OCR failed. Please try another file.", true);
  } finally {
    setBusy(false);
  }
});

elements.clearButton.addEventListener("click", resetApp);
elements.copyButton.addEventListener("click", copyResult);
elements.downloadButton.addEventListener("click", downloadResult);

async function loadFile(file) {
  resetFileResources();
  state.file = file;
  elements.fileName.textContent = file.name;
  elements.recognizeButton.disabled = false;
  elements.clearButton.disabled = false;
  elements.resultText.value = "";
  elements.copyButton.disabled = true;
  elements.downloadButton.disabled = true;
  setStatus("File loaded. Choose languages, then start recognition.");
  setProgress(0);

  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    await previewPdf(file);
    return;
  }

  previewImage(file);
}

function previewImage(file) {
  state.previewUrl = URL.createObjectURL(file);
  elements.previewFrame.innerHTML = "";
  const image = document.createElement("img");
  image.alt = `Preview of ${file.name}`;
  image.src = state.previewUrl;
  elements.previewFrame.append(image);
}

async function previewPdf(file) {
  const bytes = await file.arrayBuffer();
  state.pdfDocument = await pdfjsLib.getDocument({ data: bytes }).promise;
  const firstPage = await renderPdfPage(1);
  elements.previewFrame.innerHTML = "";
  elements.previewFrame.append(firstPage);
  setStatus(`PDF loaded with ${state.pdfDocument.numPages} page${state.pdfDocument.numPages === 1 ? "" : "s"}.`);
}

async function renderPdfPage(pageNumber) {
  const page = await state.pdfDocument.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1.65 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.dataset.pageNumber = String(pageNumber);
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  return canvas;
}

async function getOcrSources() {
  if (!state.file) {
    return [];
  }

  const isPdf = state.file.type === "application/pdf" || state.file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    return [state.file];
  }

  const pages = parsePageRange(elements.pageRange.value, state.pdfDocument.numPages);
  const canvases = [];
  for (const pageNumber of pages) {
    setStatus(`Rendering PDF page ${pageNumber}…`);
    canvases.push(await renderPdfPage(pageNumber));
  }
  state.renderedPdfCanvases = canvases;
  return canvases;
}

async function recognizeSource(source, languages, sourceIndex, totalSources) {
  const result = await Tesseract.recognize(source, languages, {
    logger: (message) => updateOcrProgress(message, sourceIndex, totalSources),
  });
  return result.data.text;
}

function updateOcrProgress(message, sourceIndex, totalSources) {
  const base = sourceIndex / totalSources;
  const current = typeof message.progress === "number" ? message.progress / totalSources : 0;
  const percent = Math.min(99, Math.round((base + current) * 100));
  const pageLabel = totalSources > 1 ? ` (${sourceIndex + 1}/${totalSources})` : "";
  setProgress(percent);
  setStatus(`${formatStatus(message.status)}${pageLabel}… ${percent}%`);
}

function getSelectedLanguages() {
  const selected = [...elements.languageSelect.selectedOptions].map((option) => option.value);
  return selected.length ? selected : ["eng"];
}

function parsePageRange(input, pageCount) {
  if (!input.trim()) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const pages = new Set();
  const chunks = input.split(",").map((chunk) => chunk.trim()).filter(Boolean);

  for (const chunk of chunks) {
    const match = chunk.match(/^(\d+)(?:-(\d+))?$/);
    if (!match) {
      throw new Error("Use PDF page ranges like 1-3,5.");
    }

    const start = Number(match[1]);
    const end = Number(match[2] || match[1]);
    if (start < 1 || end < start || end > pageCount) {
      throw new Error(`PDF pages must be between 1 and ${pageCount}.`);
    }

    for (let page = start; page <= end; page += 1) {
      pages.add(page);
    }
  }

  return [...pages].sort((a, b) => a - b);
}

async function copyResult() {
  await navigator.clipboard.writeText(elements.resultText.value);
  setStatus("Copied extracted text to the clipboard.");
}

function downloadResult() {
  const blob = new Blob([elements.resultText.value], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileStem(state.file?.name || "ocr-result")}.txt`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus("Downloaded extracted text.");
}

function fileStem(fileName) {
  return fileName.replace(/\.[^.]+$/, "") || "ocr-result";
}

function formatStatus(status = "working") {
  return status.replace(/_/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function setBusy(isBusy) {
  elements.recognizeButton.disabled = isBusy || !state.file;
  elements.languageSelect.disabled = isBusy;
  elements.pageRange.disabled = isBusy;
  elements.fileInput.disabled = isBusy;
  elements.clearButton.disabled = isBusy || !state.file;
}

function setProgress(percent) {
  elements.progressBar.style.width = `${percent}%`;
}

function setStatus(message, isError = false) {
  elements.statusText.textContent = message;
  elements.statusText.classList.toggle("error", isError);
}

function resetApp() {
  resetFileResources();
  state.file = null;
  elements.fileInput.value = "";
  elements.fileName.textContent = "No file selected";
  elements.previewFrame.innerHTML = "<p>Upload a document to see a preview.</p>";
  elements.resultText.value = "";
  elements.recognizeButton.disabled = true;
  elements.clearButton.disabled = true;
  elements.copyButton.disabled = true;
  elements.downloadButton.disabled = true;
  elements.languageSelect.disabled = false;
  elements.pageRange.disabled = false;
  elements.fileInput.disabled = false;
  elements.pageRange.value = "";
  setProgress(0);
  setStatus("Ready when you are.");
}

function resetFileResources() {
  if (state.previewUrl) {
    URL.revokeObjectURL(state.previewUrl);
  }
  state.previewUrl = null;
  state.pdfDocument = null;
  state.renderedPdfCanvases = [];
}
