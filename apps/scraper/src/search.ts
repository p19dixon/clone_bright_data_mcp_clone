import { fetchWithTimeout } from '@clone/shared';
import { JSDOM } from 'jsdom';
import { z } from 'zod';

import { config } from './config.js';

const searchSchema = z.object({
  query: z.string().min(1),
  engine: z.enum(['duckduckgo', 'google', 'bing']).default('duckduckgo'),
  cursor: z.string().optional()
});

export type SearchRequest = z.infer<typeof searchSchema>;

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchResponse {
  engine: string;
  query: string;
  nextCursor: string | null;
  results: SearchResultItem[];
  rawHtml: string;
}

function buildDuckDuckGoUrl(query: string, cursor?: string) {
  const page = cursor ? Number.parseInt(cursor, 10) : 0;
  const start = Number.isNaN(page) ? 0 : page;
  const params = new URLSearchParams({
    q: query,
    s: String(start * 30)
  });
  return `https://duckduckgo.com/html/?${params.toString()}`;
}

function parseDuckDuckGoHtml(html: string): SearchResultItem[] {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const resultNodes = doc.querySelectorAll('.result');
  return Array.from(resultNodes)
    .map((node) => {
      const anchor = node.querySelector<HTMLAnchorElement>('a.result__a');
      const snippetEl = node.querySelector<HTMLElement>('.result__snippet');
      if (!anchor) return null;
      const href = anchor.getAttribute('href') || '';
      const url = parseDuckDuckGoRedirect(href);
      return {
        title: anchor.textContent?.trim() ?? '',
        url,
        snippet: snippetEl?.textContent?.trim() ?? ''
      };
    })
    .filter((item): item is SearchResultItem => Boolean(item?.url));
}

function parseDuckDuckGoRedirect(url: string) {
  try {
    const parsed = new URL(url, 'https://duckduckgo.com');
    if (parsed.hostname === 'duckduckgo.com' && parsed.pathname === '/l/') {
      const uddg = parsed.searchParams.get('uddg');
      if (uddg) return decodeURIComponent(uddg);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export async function runSearch(input: SearchRequest): Promise<SearchResponse> {
  const { query, cursor } = searchSchema.parse(input);
  const requestUrl = buildDuckDuckGoUrl(query, cursor);
  const response = await fetchWithTimeout(requestUrl, {
    headers: {
      'user-agent': config.userAgent,
      accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
    },
    timeoutMs: config.requestTimeoutMs
  });

  const html = await response.text();
  const results = parseDuckDuckGoHtml(html);
  const nextCursor = cursor ? String(Number.parseInt(cursor, 10) + 1) : '1';

  return {
    engine: 'duckduckgo',
    query,
    nextCursor,
    results,
    rawHtml: html
  };
}

export async function runSearchBatch(requests: SearchRequest[]) {
  const jobs = requests.map((req) => runSearch(req));
  const settled = await Promise.allSettled(jobs);
  return settled.map((entry, index) => {
    if (entry.status === 'fulfilled') {
      return { success: true, response: entry.value };
    }
    return {
      success: false,
      error:
        entry.reason instanceof Error
          ? entry.reason.message
          : `search request ${index} failed`
    };
  });
}
