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
