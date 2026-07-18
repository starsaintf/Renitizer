export function documentUiCopy(documentType) {
  const fileLabel = documentType === 'pdf' ? 'PDF document' : 'Office document';
  return {
    fileLabel,
    saveCopy: `We can prepare a request to remove private document details. A clean ${documentType === 'pdf' ? 'PDF' : 'document'} is only available after a document-cleaning processor returns it.`,
    actionLabel: 'Prepare cleaning request',
  };
}
