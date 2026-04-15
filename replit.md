# Project Notes

## Overview
SwampSeatCheck is a React + Vite web app with an Express backend. The frontend is an authenticated operations dashboard for course monitoring setup, watchlists, launch controls, and live session logs.

## Current Architecture
- `server.ts` serves the Vite app in development and static `dist` assets in production.
- Session authentication is implemented with `express-session` and HTTP-only cookies.
- Auth routes: `/api/auth/signup`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`.
- Protected app routes store scaffold data in local JSON files under `data/` for development.
- Socket.IO shares the Express session and joins each user to their own live update room.
- `/api/start` now launches `automation.ts` as a child process with the user's saved config passed through `CONFIG_JSON`.
- `/api/stop` stops the running automation child process for the signed-in user.
- Automation stdout/stderr is streamed into the user's live console and stored in their session logs.
- Course result messages from automation update the user's stored results.
- Render scaffold is included in `render.yaml` with Playwright Chromium installation before `npm run build`.

## Important Decisions
- Firebase client/admin auth was removed from the primary app flow in favor of session authentication.
- Email sending uses environment variables only; no sender credentials are hardcoded.
- Runtime data in `data/` is ignored by git and should be replaced with a real database for production persistence.
- Render must redeploy after GitHub receives new commits; code changes in Replit do not automatically update Render.

## User Preferences
- User requested a web app with creative design changes.
- User requested session authentication.
- User plans to run the backend on Render.
