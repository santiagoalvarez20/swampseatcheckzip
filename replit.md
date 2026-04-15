# Project Notes

## Overview
SwampSeatCheck is a React + Vite web app with an Express backend scaffold. The frontend is an authenticated operations dashboard for course monitoring setup, watchlists, launch controls, and live session logs.

## Current Architecture
- `server.ts` serves the Vite app in development and static `dist` assets in production.
- Session authentication is implemented with `express-session` and HTTP-only cookies.
- Auth routes: `/api/auth/signup`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`.
- Protected app routes store scaffold data in local JSON files under `data/` for development.
- Socket.IO shares the Express session and joins each user to their own live update room.
- Render scaffold is included in `render.yaml` with `npm run build` and `npm start`.

## Important Decisions
- Firebase client/admin auth was removed from the primary app flow in favor of session authentication.
- The automation backend is intentionally a scaffold: `/api/start` and `/api/stop` are protected hooks ready to connect to a Render worker or production automation service.
- Email sending uses environment variables only; no sender credentials are hardcoded.
- Runtime data in `data/` is ignored by git and should be replaced with a real database for production persistence.

## User Preferences
- User requested a web app with creative design changes.
- User requested session authentication.
- User plans to run the backend on Render and does not want the backend automation fully handled here.
