'use strict';
import { z } from 'zod';
import axios from 'axios';
import { BrowserSession } from './browser_session.js';

let browserZone = process.env.BROWSER_ZONE || 'mcp_browser';

let openSession;
const requireBrowser = async () => {
  if (!openSession) {
    openSession = new BrowserSession({ cdpEndpoint: await computeCdpEndpoint() });
  }
  return openSession;
};

const computeCdpEndpoint = async () => {
  const apiToken = process.env.API_TOKEN;
  if (!apiToken) throw new Error('API_TOKEN required for browser tools');
  try {
    const status = await axios({ url: 'https://api.brightdata.com/status', method: 'GET', headers: { authorization: `Bearer ${apiToken}` } });
    const customer = status.data.customer;
    const pw = await axios({ url: `https://api.brightdata.com/zone/passwords?zone=${browserZone}` , method: 'GET', headers: { authorization: `Bearer ${apiToken}` } });
    const password = pw.data.passwords[0];
    return `wss://brd-customer-${customer}-zone-${browserZone}:${password}@brd.superproxy.io:9222`;
  } catch (e) {
    if (e.response?.status === 422) throw new Error(`Browser zone '${browserZone}' does not exist`);
    throw new Error(`Error retrieving browser credentials: ${e.message}`);
  }
};

const asMarkdownList = (rows) => JSON.stringify(rows, null, 2);

const navigate = {
  name: 'scraping_browser_navigate',
  description: 'Navigate a scraping browser session to a new URL',
  parameters: z.object({ url: z.string() }),
  execute: async ({ url }) => {
    const page = await (await requireBrowser()).getPage({ url });
    await page.goto(url, { timeout: 120000, waitUntil: 'domcontentloaded' });
    return [`Navigated to ${url}`, `Title: ${await page.title()}`, `URL: ${page.url()}`].join('\n');
  },
};

const goBack = {
  name: 'scraping_browser_go_back',
  description: 'Go back to the previous page',
  parameters: z.object({}),
  execute: async () => {
    const page = await (await requireBrowser()).getPage();
    await page.goBack();
    return [`Navigated back`, `Title: ${await page.title()}`, `URL: ${page.url()}`].join('\n');
  },
};

const goForward = {
  name: 'scraping_browser_go_forward',
  description: 'Go forward to the next page',
  parameters: z.object({}),
  execute: async () => {
    const page = await (await requireBrowser()).getPage();
    await page.goForward();
    return [`Navigated forward`, `Title: ${await page.title()}`, `URL: ${page.url()}`].join('\n');
  },
};

const click = {
  name: 'scraping_browser_click',
  description: 'Click on an element by selector',
  parameters: z.object({ selector: z.string() }),
  execute: async ({ selector }) => {
    const page = await (await requireBrowser()).getPage();
    await page.click(selector, { timeout: 5000 });
    return `Clicked ${selector}`;
  },
};

const links = {
  name: 'scraping_browser_links',
  description: 'Get all links (text, href, selector) on the page',
  parameters: z.object({}),
  execute: async () => {
    const page = await (await requireBrowser()).getPage();
    const data = await page.$$eval('a', els => els.map(el => ({ text: el.innerText, href: el.href, selector: el.outerHTML })));
    return asMarkdownList(data);
  },
};

const type = {
  name: 'scraping_browser_type',
  description: 'Type text into an element, optionally submit',
  parameters: z.object({ selector: z.string(), text: z.string(), submit: z.boolean().optional() }),
  execute: async ({ selector, text, submit }) => {
    const page = await (await requireBrowser()).getPage();
    await page.fill(selector, text);
    if (submit) await page.press(selector, 'Enter');
    return `Typed into ${selector}${submit ? ' and submitted' : ''}`;
  },
};

const waitFor = {
  name: 'scraping_browser_wait_for',
  description: 'Wait for an element to be visible on the page',
  parameters: z.object({ selector: z.string(), timeout: z.number().optional() }),
  execute: async ({ selector, timeout }) => {
    const page = await (await requireBrowser()).getPage();
    await page.waitForSelector(selector, { timeout: timeout || 30000 });
    return `Waited for ${selector}`;
  },
};

const screenshot = {
  name: 'scraping_browser_screenshot',
  description: 'Screenshot of the current page',
  parameters: z.object({ full_page: z.boolean().optional() }),
  execute: async ({ full_page = false }) => {
    const page = await (await requireBrowser()).getPage();
    const buffer = await page.screenshot({ fullPage: full_page });
    // fastmcp supports image content via helper; return base64 for bridge
    return `data:image/png;base64,${buffer.toString('base64')}`;
  },
};

const getHtml = {
  name: 'scraping_browser_get_html',
  description: 'Get HTML content of the current page',
  parameters: z.object({ full_page: z.boolean().optional() }),
  execute: async ({ full_page = false }) => {
    const page = await (await requireBrowser()).getPage();
    if (!full_page) return await page.$eval('body', b => b.innerHTML);
    return await page.content();
  },
};

const getText = {
  name: 'scraping_browser_get_text',
  description: 'Get text content of the current page',
  parameters: z.object({}),
  execute: async () => {
    const page = await (await requireBrowser()).getPage();
    return await page.$eval('body', b => b.innerText);
  },
};

const scroll = {
  name: 'scraping_browser_scroll',
  description: 'Scroll to the bottom of the page',
  parameters: z.object({}),
  execute: async () => {
    const page = await (await requireBrowser()).getPage();
    await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); });
    return 'Scrolled to bottom';
  },
};

const scrollTo = {
  name: 'scraping_browser_scroll_to',
  description: 'Scroll to a specific element',
  parameters: z.object({ selector: z.string() }),
  execute: async ({ selector }) => {
    const page = await (await requireBrowser()).getPage();
    await page.evaluate(sel => { const el = document.querySelector(sel); if (!el) throw new Error(`No element ${sel}`); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, selector);
    return `Scrolled to ${selector}`;
  },
};

export const browserTools = process.env.API_TOKEN ? [
  navigate,
  goBack,
  goForward,
  links,
  click,
  type,
  waitFor,
  screenshot,
  getText,
  getHtml,
  scroll,
  scrollTo,
] : [];

