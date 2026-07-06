# Tanzer Training Tracker

A dog-training documentation app: organize dogs into folders, open a dog
profile, log training reports, and track progress toward graduation.

Design doc: https://app.notion.com/p/Abby-s-Dog-Notes-Project-3933c519147b81c1b582c85c92ec3baa?source=copy_link

This is the web proof-of-concept. It runs entirely in the browser and stores
data in `localStorage` — no backend yet. The final product is planned as an
offline-first on-device phone app; this POC exists to validate the workflow,
data model, and UI first.

## Features

- Nested folder navigation for organizing dogs
- Dog profiles with photo, current phase, and graduation progress bar
- Training reports: phase, red flag, location, notes, picture
- Red-flagged report filter view across all dogs
- Per-phase checklists and milestones that drive graduation progress

## Development

```sh
npm install
npm run dev
```

Other scripts:

```sh
npm run build    # typecheck + production build to dist/
npm run lint      # oxlint
npm run preview   # preview a production build locally
```

## Deployment

Pushing to `main` builds the app and deploys it to GitHub Pages via
`.github/workflows/deploy.yml`. Enable Pages for this repo under
Settings → Pages → Source: GitHub Actions.
