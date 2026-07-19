# Renitizer document processor

This private service creates a transformed document; it does not return a successful response until the transformation exits successfully.

- PDF: QPDF removes document info, metadata, page labels, the structure tree, interactive form dictionary, and flattens annotations into the rendered pages.
- Office Open XML (`.docx`, `.xlsx`, `.pptx`): removes document properties, comments, tracked revisions, signatures, thumbnails, embedded fonts, embedded objects, macros, and matching package relationships.

Run it only behind the Renitizer Worker with a high-entropy `PROCESSOR_AUTH_TOKEN` shared by the two services:

```sh
docker build -t renitizer-document-processor ./processor/document
docker run --rm -p 8080:8080 -e PROCESSOR_AUTH_TOKEN=replace-with-a-secret renitizer-document-processor
```

The Worker sends `POST /v1/clean/document`, the raw private document, `Authorization: Bearer <PROCESSOR_AUTH_TOKEN>`, and `X-Renitizer-Document-Type: pdf` or `office`. Do not publish this service directly to the internet.
