/**
 * Metabolic Service (barrel)
 *
 * The core event-driven TDEE calculation and persistence logic lives in
 * `./metabolic/service` (moved there in Task 8 of the core-separation
 * refactor). This module re-exports it so every existing import path
 * (`@/lib/metabolicService`) keeps working unmodified.
 *
 * The browser-console debug tooling that used to live here moved to
 * `./metabolic/debugTools` (Task 9) and is loaded only via a dev-only
 * dynamic import — deliberately NOT re-exported from this barrel, since
 * doing so would pull it back into every page's client bundle.
 */

export * from './metabolic/service';
