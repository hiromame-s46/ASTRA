# Changelog

## v1.0.0 - 2026-06-05

First major OSS-oriented release of ASTRA.

### Changed

- Reworked ASTRA into a community-agnostic OSS setup.
- Removed external shared `../data` dependencies.
- Removed blog-based sorting workflows.
- Removed MySQL/PDO/database authentication dependencies.
- Moved initial setup and operational settings into `admin.html`.
- Replaced database-backed accounts with `.env` admin credentials.
- Added JSON-based contributor access settings under `data/access.json`.
- Added hashed shared-password and individual contributor-user support.
- Split training into two focused pages:
  - `train-upload-image.html` for local upload training without saving original images.
  - `train-from-image.html` for training from admin-provided source images.
- Added independent access modes for each training page:
  - no login
  - shared password
  - contributor users
- Stopped tracking runtime JSON files such as descriptors, stats, members, access settings, and sessions.
- Added `.htaccess` protection for runtime JSON and admin-uploaded source images.
- Rewrote README for OSS setup, deployment, runtime data, and security notes.

### Removed

- `train.html`
- `sort.html`
- `sort.js`
- `train-image.html`
- `train-image.js`
- DB-backed user/session lookup
- Blog/image queue dependencies from external community data

### Security

- Admin credentials are configured through `.env`.
- Production deployments can use `ASTRA_ADMIN_PASSWORD_HASH`.
- Contributor passwords are stored with PHP `password_hash()`.
- Runtime JSON files are ignored by Git and blocked from direct Apache access.
