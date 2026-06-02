# Polyglot OCR Studio

Polyglot OCR Studio is a multilingual, browser-only OCR web app built with JavaScript. It uses client-side Tesseract.js for text recognition and PDF.js for rendering PDF pages before OCR, so uploaded files stay in the browser.

## Features

- Recognizes text from image files and PDFs.
- Supports selecting one or more OCR languages, including English, Spanish, French, German, Italian, Portuguese, Hindi, Japanese, Korean, Simplified Chinese, Arabic, and Russian.
- Lets users process all PDF pages or a custom range such as `1-3,5`.
- Displays upload previews, OCR progress, extracted text, and copy/download actions.
- Runs as a static frontend with no Java or backend service required.

## Run the app

Start the JavaScript static server from the repository root, then open the printed URL in a browser:

```bash
npm start
```

The app loads Tesseract.js and PDF.js from CDNs, so an internet connection is required when opening the page.
