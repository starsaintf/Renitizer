export function getShareableCleanOutput({ cleanFile = null, remoteVideo = null, remoteDocument = null } = {}) {
  if (cleanFile) return { kind: 'local', file: cleanFile };
  if (remoteVideo?.ready) return { kind: 'remote', fileName: 'renitized-video.mp4', mimeType: 'video/mp4', job: remoteVideo };
  if (remoteDocument?.ready) {
    return {
      kind: 'remote',
      fileName: remoteDocument.documentType === 'pdf' ? 'renitized-document.pdf' : 'renitized-document.office',
      mimeType: remoteDocument.documentType === 'pdf' ? 'application/pdf' : null,
      job: remoteDocument,
    };
  }
  return null;
}

export async function resolveShareableCleanOutput({ cleanFile = null, remoteVideo = null, remoteDocument = null, downloadRemoteJob, FileCtor = File } = {}) {
  const output = getShareableCleanOutput({ cleanFile, remoteVideo, remoteDocument });
  if (!output) return null;
  if (output.kind === 'local') return output.file;
  if (typeof downloadRemoteJob !== 'function' || typeof FileCtor !== 'function') throw new Error('The clean output cannot be prepared for sharing.');
  const blob = await downloadRemoteJob(output.job);
  if (!(blob instanceof Blob) || !blob.size) throw new Error('The clean output could not be downloaded.');
  return new FileCtor([blob], output.fileName, { type: blob.type || output.mimeType || 'application/octet-stream' });
}

export function createGenericPackageFile(cleanOutput, FileCtor = File) {
  return createGenericFile(cleanOutput, 'renitizer-clean-copy', FileCtor);
}

export function createGenericOriginalArchiveFile(originalFile, FileCtor = File) {
  return createGenericFile(originalFile, 'renitizer-original', FileCtor);
}

function createGenericFile(file, baseName, FileCtor) {
  if (!file || typeof file.arrayBuffer !== 'function' || typeof FileCtor !== 'function') throw new Error('The file cannot be prepared for encrypted storage.');
  const mimeType = file.type || 'application/octet-stream';
  return new FileCtor([file], `${baseName}${extensionForMimeType(mimeType)}`, { type: mimeType });
}

function extensionForMimeType(mimeType) {
  return ({
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif',
    'audio/wav': '.wav', 'video/mp4': '.mp4', 'application/pdf': '.pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  })[mimeType] || '';
}
