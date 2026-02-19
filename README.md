<p align="center">
  <img src="./public/livegrid-logo.svg" alt="LiveGrid" width="420" />
</p>

<p align="center">
  Multi-platform livestream monitor with a dynamic CCTV-style grid.
</p>

<p align="center">
  <a href="https://livegrid.pablosouza.dev" target="_blank" rel="noreferrer">livegrid.pablosouza.dev</a>
</p>

---

## Overview

LiveGrid helps you watch multiple creators at the same time in a single, interactive dashboard.
It is designed for scenarios like group trips, collabs, and events where several channels go live together.

## Features

- Dynamic drag-and-resize grid layout
- Automatic viewport fitting and layout persistence
- Separate layout storage for desktop and mobile
- Multi-platform support:
  - YouTube
  - Twitch
  - Kick
- Multiple sources per creator in the same tile (switch source in the title bar)
- Featured presets + user projects
- Share projects via URL (`preset` query param) and QR code
- Import shared projects with one click
- i18n with browser language detection and language switcher

## Live Site

- **Production:** https://livegrid.pablosouza.dev

## Tech Stack

- Next.js 16 (App Router)
- React 19 + TypeScript
- Tailwind CSS 4
- shadcn/ui + Radix UI
- Lucide icons
- React Grid Layout
- TanStack Query

## Project Structure

```txt
app/                  # routes, layout, API handlers
components/           # app components
components/ui/        # shadcn/ui base components
data/                 # presets and static data
lib/                  # domain logic, network logic, grid engine
public/               # static assets (logo, icons, preset images)
```

## Import Aliases

Configured in `tsconfig.json`:

- `@app/*`
- `@components/*`
- `@ui/*`
- `@data/*`
- `@lib/*`
- `@/*`

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Run in development

```bash
npm run dev
```

### 3. Build for production

```bash
npm run build
npm start
```

### 4. Lint

```bash
npm run lint
```

## Deploy

This project is Vercel-ready.

- Connect the repository to Vercel
- Keep default Next.js build settings
- Set `NEXT_PUBLIC_SITE_URL` for canonical links and About page URL

## Internationalization

Current language support:

- English
- Portuguese (Brazil)
- Spanish
- French
- Arabic
- Russian
- Hindi
- Bengali
- Urdu
- Simplified Chinese

## Notes

- Live status is checked through internal API routes in `app/api/*`.
- Shared projects are opened from URL and can be imported into local projects.

## Credits

Built by **Pablo Souza**.
