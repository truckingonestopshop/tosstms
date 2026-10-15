// Development-only UI preview with sample data (no login, no database).
// Turned on by visiting /preview-ui; impossible in production builds.
export const PREVIEW_COOKIE = "tms_ui_preview";
export const previewAllowed = () => process.env.NODE_ENV === "development";
