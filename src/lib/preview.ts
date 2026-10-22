// Development-only UI preview with sample data (no login, no database).
// Turned on by visiting /preview-ui; impossible in production builds.
export const PREVIEW_COOKIE = "tms_ui_preview";
/** /preview-ui?office or ?dispatch picks the view the preview shows. */
export const PREVIEW_VIEW_COOKIE = "tms_ui_view";
export const previewAllowed = () => process.env.NODE_ENV === "development";
