# ASTRA

![ASTRA logo](assets/astra-logo.png)

**ASTRA** is **Adaptive Sakurazaka Technology Recognition Architecture**.

ASTRA is a standalone face-recognition tool migrated from the SakuLabo AI feature set. It keeps the current face-api.js based model flow while moving the UI, training, sorting, data files, icons, and API endpoint into an independent project folder.

## Features

- Image-based member recognition with multiple faces per image
- Batch image recognition on the main screen
- Training page for registering face descriptors
- Sorting page for collaborator-friendly blog-image labeling
- Existing descriptor JSON compatibility
- ASTRA-branded logo, icons, and favicon assets

## Structure

```text
.
├── index.html      # recognition screen
├── train.html      # training screen
├── sort.html       # sorting screen
├── api.php         # descriptor, stats, auth check, image proxy API
├── data/           # descriptors, stats, members, blogs
├── assets/         # ASTRA logo
└── icon/           # favicon and PWA icons
```

## Notes

The recognition model itself is unchanged and still uses `@vladmandic/face-api` models loaded from jsDelivr. Existing descriptor data can be used as-is through `data/descriptors.json`.
