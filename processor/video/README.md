# Renitizer video renderer

This service receives an authenticated video stream and a compact list of normalized cover tracks. It uses FFmpeg to render black, time-bounded boxes, removes mapped metadata, keeps the optional audio stream, and returns a new MP4. It never receives original filenames or Renvoy credentials.

Required environment variables:

- `PROCESSOR_AUTH_TOKEN`: a high-entropy secret shared only with the Renitizer Worker.
- `PORT`: optional, defaults to `8080`.
- `MAX_VIDEO_BYTES`: optional input limit, defaults to 2 GiB.

Build and run:

```sh
docker build -t renitizer-video-renderer processor/video
docker run --rm -p 8080:8080 -e PROCESSOR_AUTH_TOKEN=replace-with-a-secret renitizer-video-renderer
```

The Worker sends `POST /v1/render/video` with `Authorization: Bearer <PROCESSOR_AUTH_TOKEN>`, the raw private video as the request body, and base64url JSON tracks in `X-Renitizer-Video-Tracks`. Do not expose this service publicly without network access controls in addition to the bearer secret.
