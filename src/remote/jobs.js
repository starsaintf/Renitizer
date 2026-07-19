export async function submitRemoteJob({ session, file, metadata, fetcher = fetch }) {
  const form = new FormData();
  form.set('metadata', JSON.stringify(metadata));
  form.set('file', file, file.name);
  const response = await fetcher(`${session.endpoint}/api/jobs/upload`, {
    method: 'POST', headers: { Authorization: `Renvoy ${session.capability}` }, body: form,
  });
  if (!response.ok) throw new Error('Private processing could not start.');
  return response.json();
}
