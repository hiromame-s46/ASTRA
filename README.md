# ASTRA

![ASTRA logo](assets/astra-logo.png)

**ASTRA** is **Adaptive Scalable Training Recognition Architecture**.

ASTRA is a browser-based face recognition and training-data management app for small communities. It detects faces in images, compares them with locally collected face descriptors, and helps collaborators build training data without requiring a database or a community-specific data source.

## Features

- Public image recognition page
- Browser-side face detection and descriptor extraction with face-api.js
- Per-face candidate display for multi-person images
- Admin page for initial setup and runtime management
- Member/person name management from `admin.html`
- Uploaded-image training workflow: `train-upload-image.html`
- Admin-provided source-image training workflow: `train-from-image.html`
- Separate access mode per training page
- Shared-password or individual contributor-user access
- Contributor passwords stored as hashes in JSON
- Runtime data stored in local JSON files
- `.htaccess` rules to deny direct access to JSON training data
- No MySQL/PDO/database dependency
- No external `../data` dependency
- No blog/sorting workflow dependency

## Releases

See [CHANGELOG.md](CHANGELOG.md) for release notes.

## Pages

```text
index.html               Public recognition page
admin.html               Admin setup and management
train-upload-image.html  Train from collaborator-uploaded local images
train-from-image.html    Train from images uploaded by the admin
```

## Setup

1. Copy `.env.example` to `.env`.
2. Set the admin credentials.
3. Open `admin.html`.
4. Register the people/members for your community.
5. Choose access modes for the two training pages.
6. Optionally set a shared contributor password or create contributor users.
7. Optionally upload source images for `train-from-image.html`.

Example `.env`:

```dotenv
ASTRA_ADMIN_USERNAME=admin
ASTRA_ADMIN_PASSWORD=change-this-password
```

For production, prefer a password hash:

```bash
php -r 'echo password_hash("your-password", PASSWORD_DEFAULT) . PHP_EOL;'
```

Then put it in `.env`:

```dotenv
ASTRA_ADMIN_USERNAME=admin
ASTRA_ADMIN_PASSWORD_HASH=$2y$10$...
```

`.env` is ignored by Git and should not be committed.

## Access Model

`admin.html` always requires the admin credentials from `.env`.

The recognition page, `index.html`, does not require login.

Each training page can be configured independently in `admin.html`:

```text
none    No login required
shared  Shared contributor password
users   Individual contributor users
```

Contributor users and the shared password are stored in `data/access.json`. Passwords are saved with PHP `password_hash()`, not in plain text.

## Training Workflows

### `train-upload-image.html`

Collaborators select one or more local image files. ASTRA analyzes them in the browser and sends only face descriptors and selected person names to the API. The original image files are not saved.

### `train-from-image.html`

Admins upload source images from `admin.html`. Collaborators then process those images from `train-from-image.html`. The images are stored under `uploads/source/` and served through `api.php` after access checks. Direct web access to that folder is denied by `.htaccess`.

## Runtime Data

Runtime JSON files are created automatically:

```text
data/descriptors.json  Face descriptors grouped by person name
data/stats.json        Descriptor count and last update per person
data/members.json      People/member name settings
data/access.json       Contributor access settings and password hashes
data/sessions.json     Runtime login sessions
```

The `data/.htaccess` file denies direct access to JSON files. Keep this file on Apache deployments. For other web servers, configure equivalent rules so these files cannot be downloaded directly.

## Git Ignore

Runtime files and secrets are ignored:

```text
.env
.env.*
data/descriptors.json
data/stats.json
data/members.json
data/access.json
data/sessions.json
uploads/train/*
uploads/source/*
```

`uploads/source/.htaccess` and `.gitkeep` are committed, but uploaded source images are not.

## Directory Structure

```text
.
├── index.html
├── admin.html
├── train-upload-image.html
├── train-from-image.html
├── app.js
├── admin.js
├── training.js
├── matcher.js
├── api.php
├── style.css
├── data/
│   └── .htaccess
├── uploads/
│   ├── train/
│   │   └── .gitkeep
│   └── source/
│       ├── .gitkeep
│       └── .htaccess
├── assets/
└── icon/
```

## API Overview

Public:

```text
GET  api.php?action=public_config
GET  api.php?action=members
GET  api.php?action=descriptors
GET  api.php?action=stats
```

Admin:

```text
POST api.php?action=admin_login
POST api.php?action=admin_logout
GET  api.php?action=admin_me
GET  api.php?action=admin_settings
POST api.php?action=admin_save_members
POST api.php?action=admin_save_access
POST api.php?action=admin_set_shared_password
POST api.php?action=admin_save_user
POST api.php?action=admin_delete_user
POST api.php?action=admin_upload_source_images
POST api.php?action=admin_delete_source_image
POST api.php?action=reset_member_descriptors
```

Contributor/training:

```text
GET  api.php?action=access_me&page=upload
GET  api.php?action=access_me&page=from_image
POST api.php?action=contributor_login
POST api.php?action=contributor_logout
GET  api.php?action=source_images
GET  api.php?action=source_image&id=...
POST api.php?action=save_descriptor
```

## Security Notes

- Keep `.env` outside version control.
- Use `ASTRA_ADMIN_PASSWORD_HASH` in production when possible.
- Keep `data/.htaccess` and `uploads/source/.htaccess` enabled on Apache.
- Configure equivalent deny rules on Nginx or other servers.
- Do not publish runtime JSON files or uploaded source images as repository assets.
- Use HTTPS when contributor access is enabled.

## License

MIT License. See [LICENSE](LICENSE).
