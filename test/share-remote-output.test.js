import assert from 'node:assert/strict';
import test from 'node:test';
import { File } from 'node:buffer';
import { createGenericPackageFile, getShareableCleanOutput, resolveShareableCleanOutput } from '../src/share/remote-output.js';

test('prefers a browser-created clean file without fetching a remote job', async () => {
  const cleanFile = new File(['clean'], 'photo-clean.jpg', { type: 'image/jpeg' });
  const output = getShareableCleanOutput({ cleanFile });

  assert.deepEqual(output, { kind: 'local', file: cleanFile });
  const resolved = await resolveShareableCleanOutput({ cleanFile, downloadRemoteJob: async () => { throw new Error('should not download'); }, FileCtor: File });
  assert.equal(resolved, cleanFile);
});

test('turns only a completed owner-only remote video into a locally named clean file', async () => {
  const remoteVideo = { ready: true, session: { endpoint: 'https://renitizer.example', capability: 'capability' }, jobId: 'job_video' };
  const output = getShareableCleanOutput({ remoteVideo });

  assert.deepEqual(output, { kind: 'remote', fileName: 'renitized-video.mp4', mimeType: 'video/mp4', job: remoteVideo });
  const resolved = await resolveShareableCleanOutput({
    remoteVideo,
    downloadRemoteJob: async (job) => { assert.equal(job, remoteVideo); return new Blob(['clean video'], { type: 'video/mp4' }); },
    FileCtor: File,
  });
  assert.equal(resolved.name, 'renitized-video.mp4');
  assert.equal(resolved.type, 'video/mp4');
  assert.equal(await resolved.text(), 'clean video');
});

test('does not offer queued remote output for encryption', () => {
  assert.equal(getShareableCleanOutput({ remoteVideo: { ready: false, jobId: 'job_video' } }), null);
  assert.equal(getShareableCleanOutput({ remoteDocument: { ready: false, jobId: 'job_document' } }), null);
});

test('uses a generic safe name for a completed Office output', async () => {
  const remoteDocument = { ready: true, documentType: 'office', session: { endpoint: 'https://renitizer.example', capability: 'capability' }, jobId: 'job_document' };
  const resolved = await resolveShareableCleanOutput({
    remoteDocument,
    downloadRemoteJob: async () => new Blob(['clean document'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
    FileCtor: File,
  });

  assert.equal(resolved.name, 'renitized-document.office');
  assert.equal(resolved.type, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
});

test('replaces an identifying clean filename before package encryption', async () => {
  const packageFile = createGenericPackageFile(
    new File(['clean pixels'], 'passport-and-home-address-clean.jpeg', { type: 'image/jpeg' }),
    File,
  );

  assert.equal(packageFile.name, 'renitizer-clean-copy.jpg');
  assert.equal(packageFile.type, 'image/jpeg');
  assert.equal(await packageFile.text(), 'clean pixels');
});
