'use strict';
import * as playwright from 'playwright';

export class BrowserSession {
  constructor({ cdpEndpoint }) {
    this.cdpEndpoint = cdpEndpoint;
    this._domainSessions = new Map();
    this._currentDomain = 'default';
  }

  _getDomain(url) {
    try { return new URL(url).hostname; }
    catch { return 'default'; }
  }

  async _getDomainSession(domain) {
    if (!this._domainSessions.has(domain)) {
      this._domainSessions.set(domain, { browser: null, page: null, browserClosed: true });
    }
    return this._domainSessions.get(domain);
  }

  async getBrowser({ domain = 'default', log } = {}) {
    const session = await this._getDomainSession(domain);
    if (session.browser) {
      try { await session.browser.contexts(); }
      catch (e) {
        log?.(`Browser lost for ${domain}: ${e.message}`);
        session.browser = null; session.page = null; session.browserClosed = true;
      }
    }
    if (!session.browser) {
      log?.(`Connecting scraping browser for ${domain}`);
      session.browser = await playwright.chromium.connectOverCDP(this.cdpEndpoint);
      session.browserClosed = false;
      session.browser.on('disconnected', () => {
        session.browser = null; session.page = null; session.browserClosed = true;
      });
      log?.(`Connected scraping browser for ${domain}`);
    }
    return session.browser;
  }

  async getPage({ url = null } = {}) {
    if (url) this._currentDomain = this._getDomain(url);
    const domain = this._currentDomain;
    const session = await this._getDomainSession(domain);
    if (session.browserClosed || !session.page) {
      const browser = await this.getBrowser({ domain });
      const contexts = browser.contexts();
      if (contexts.length === 0) {
        const context = await browser.newContext();
        session.page = await context.newPage();
      } else {
        const pages = contexts[0].pages();
        session.page = pages.length ? pages[0] : await contexts[0].newPage();
      }
      session.browserClosed = false;
      session.page.once('close', () => { session.page = null; });
    }
    return session.page;
  }

  async close(domain = null) {
    if (domain) {
      const s = this._domainSessions.get(domain);
      if (s?.browser) { try { await s.browser.close(); } catch {} }
      this._domainSessions.delete(domain);
    } else {
      for (const [d, s] of this._domainSessions.entries()) {
        if (s.browser) { try { await s.browser.close(); } catch {} }
      }
      this._domainSessions.clear();
      this._currentDomain = 'default';
    }
  }
}

