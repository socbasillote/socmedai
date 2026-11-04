/**
 * Central application page paths.
 *
 * These labels match the existing dashboard
 * navigation system.
 *
 * Do not change existing paths during refactoring.
 */

export const PAGE_PATHS = {
  Overview: "/",
  Posts: "/posts",
  "Content calendar": "/calendar",
  "Content studio": "/studio",
  "Media library": "/media",
  Publishing: "/publishing",
  Analytics: "/analytics",
  Settings: "/settings",
} as const;

export type DashboardPageName = keyof typeof PAGE_PATHS;

export type DashboardPagePath = (typeof PAGE_PATHS)[DashboardPageName];
