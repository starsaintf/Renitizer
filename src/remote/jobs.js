export async function submitRemoteJob({ session, file, metadata, fetcher = fetch }) {
  const uploadFile = fileWithDeclaredMimeType(file, metadata?.mimeType);
  const form = new FormData();
  form.set('metadata', JSON.stringify(metadata));
  form.set('file', uploadFile, uploadFile.name);
  const response = await fetcher(`${session.endpoint}/api/jobs/upload`, {
    method: 'POST', headers: { Authorization: `Renvoy ${session.capability}` }, body: form,
  });
  if (!response.ok) throw new Error('Private processing could not start.');
  return response.json();
}

function fileWithDeclaredMimeType(file, declaredMimeType) {
  const expected = String(declaredMimeType || '').trim().toLowerCase();
  const actual = String(file?.type || '').trim().toLowerCase();
  if (!expected || actual === expected) return file;
  if (actual && actual !== 'application/octet-stream') throw new Error('The selected file type no longer matches the private processing request.');
  return new File([file], file.name, { type: expected, lastModified: file.lastModified });
}

export async function getRemoteJob({ session, jobId, fetcher = fetch }) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(jobId)) throw new Error('Private job is invalid.');
  const response = await fetcher(`${session.endpoint}/api/jobs/${jobId}`, { headers: { Authorization: `Renvoy ${session.capability}` } });
  if (!response.ok) throw new Error('Private job is unavailable.');
  return response.json();
}

export async function downloadRemoteJob({ session, jobId, fetcher = fetch }) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(jobId)) throw new Error('Private job is invalid.');
  const response = await fetcher(`${session.endpoint}/api/jobs/${jobId}/output`, { headers: { Authorization: `Renvoy ${session.capability}` } });
  if (!response.ok) throw new Error('Private clean copy is unavailable.');
  return response.blob();
}
