export function buildPdfSanitizeCommand(inputPath, outputPath) {
  return [
    '--remove-info', '--remove-metadata', '--remove-page-labels', '--remove-structure',
    '--flatten-annotations=all', '--remove-acroform', inputPath, outputPath,
  ];
}

export function normalizeDocumentType(value) {
  if (value === 'pdf' || value === 'office') return value;
  throw new Error('Unsupported document type.');
}
