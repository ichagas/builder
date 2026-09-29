// Pure path matchers used by ProjectLayout (kept apart so they unit-test without the layout's imports).

/** `/p/:id/v/<any version segment>/<phase>/<tool>`: groups 1 and 2 are phase and tool. Also matches `v/<version>/ship/release`. */
export const TOOL_PATH = /^\/p\/[^/]+\/v\/[^/]+\/([^/]+)\/([^/]+)/;
/** Same, but only for a non-`current` version segment (a version-scoped tool, NV-06). */
export const SCOPED_TOOL_PATH = /^\/p\/[^/]+\/v\/(?!current\/)[^/]+\/([^/]+)\/([^/]+)/;
