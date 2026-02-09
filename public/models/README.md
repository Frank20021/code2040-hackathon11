# Model file required

This app expects the MediaPipe FaceLandmarker model at:

- `public/models/face_landmarker.task`

To download it automatically:

```bash
npm run download:model
```

Or download the official [Face Landmarker model](https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task) and place it at that path.

If the file is missing or invalid, the app will show a model-load error (e.g. "Unable to open zip archive").

