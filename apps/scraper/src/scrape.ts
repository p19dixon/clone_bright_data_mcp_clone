import { fetchWithTimeout } from '@clone/shared';

import { config } from './config.js';
import { htmlToMarkdown } from './markdown.js';

const defaultHeaders = {
  'user-agent': config.userAgent,
  accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
};

export interface ScrapeResult {
  url: string;
  status: number;
  headers: Record<string, string>;
  html: string;
}

export async function scrapeHtml(url: string): Promise<ScrapeResult> {
  const response = await fetchWithTimeout(url, {
    headers: defaultHeaders,
    timeoutMs: config.requestTimeoutMs,
    redirect: 'follow'
  });

  const html = await response.text();
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return {
    url: response.url || url,
    status: response.status,
    headers,
    html
  };
}

export async function scrapeMarkdown(url: string) {
  const result = await scrapeHtml(url);
  return {
    ...result,
    markdown: htmlToMarkdown(result.html)
  };
}

export async function batchScrape(urls: string[]) {
  const jobs = urls.map((url) => scrapeMarkdown(url));
  const results = await Promise.allSettled(jobs);
  return results.map((entry, idx) => {
    if (entry.status === 'fulfilled') {
      const { markdown, ...rest } = entry.value;
      return {
        success: true,
        url: rest.url,
        status: rest.status,
        headers: rest.headers,
        markdown
      };
    }
    return {
      success: false,
      url: urls[idx],
      error: entry.reason instanceof Error ? entry.reason.message : String(entry.reason)
    };
  });
}
