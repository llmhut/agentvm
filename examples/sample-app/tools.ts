/**
 * Custom tools for the research assistant.
 */

import type { ToolDefinition } from '../../src/core/types';

/**
 * Extract readable text from HTML.
 * Strips scripts, styles, and tags — returns plain text.
 */
export const extractTextTool: ToolDefinition = {
  name: 'extract_text',
  description:
    'Extract readable text from HTML content. Strips tags and returns plain text.',
  parameters: {
    type: 'object',
    properties: {
      html: { type: 'string', description: 'HTML content to extract text from' },
      maxLength: {
        type: 'number',
        description: 'Max output length in characters (default: 8000)',
      },
    },
    required: ['html'],
  },
  sideEffects: 'none',
  permission: 'public',
  handler: async (params) => {
    const p = params as { html: string; maxLength?: number };
    const maxLen = p.maxLength ?? 8000;

    const text = p.html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();

    return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
  },
};
