export function documentUiCopy(documentType) {
  const fileLabel = documentType === 'pdf' ? 'PDF document' : 'Office document';
  return {
    fileLabel,
    saveCopy: `We can prepare a request to remove private document details. A clean ${documentType === 'pdf' ? 'PDF' : 'document'} is only available after a document-cleaning processor returns it.`,
    actionLabel: 'Prepare cleaning request',
  };
}

export function documentReadyCopy(documentType, outputDocumentType) {
  if (documentType === 'office' && outputDocumentType === 'pdf') {
    return {
      status: 'Your private clean PDF is ready to save.',
      note: 'Your Office file was turned into a clean PDF so private document details could be removed safely.',
    };
  }
  return {
    status: 'Your private clean copy is ready to save.',
    note: 'Your clean document is ready in Renvoy.',
  };
}
