import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from 'undici';

process.env.SCRAPER_USER_AGENT = 'scraper-test-agent';

process.on('uncaughtException', (err) => {
  console.error('uncaught-exception', err);
  throw err;
});

process.on('unhandledRejection', (reason) => {
  console.error('unhandled-rejection', reason);
  throw reason instanceof Error ? reason : new Error(String(reason));
});

const mockAgent = new MockAgent();
mockAgent.disableNetConnect();

const originalDispatcher = getGlobalDispatcher();

const exampleClient = mockAgent.get('https://example.com');
exampleClient
  .intercept({ path: '/', method: 'GET' })
  .reply(200, '<html><body><h1>Example Title</h1><p>Hello World</p></body></html>', {
    headers: { 'content-type': 'text/html' }
  });

const errorClient = mockAgent.get('https://failure.test');
errorClient.intercept({ path: '/', method: 'GET' }).replyWithError(new Error('boom'));

const duckClient = mockAgent.get('https://duckduckgo.com');
const searchHtml = `
<html>
  <body>
    <div class="result">
      <a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpost">Example result</a>
      <div class="result__snippet">Snippet text</div>
    </div>
  </body>
</html>`;

duckClient
  .intercept({
    path: '/html/',
    method: 'GET',
    query: { q: 'markdown testing', s: '0' }
  })
  .reply(200, searchHtml, { headers: { 'content-type': 'text/html' } });

const { buildServer } = await import('../src/server.ts');

describe('scraper service', () => {
  before(() => {
    setGlobalDispatcher(mockAgent);
  });

  after(async () => {
    await mockAgent.close();
    if (originalDispatcher) {
      setGlobalDispatcher(originalDispatcher);
    }
  });

  it('scrapes markdown for a single URL', async () => {
    const app = buildServer();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/scrape/markdown',
      payload: { url: 'https://example.com/' }
    });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.url, 'https://example.com/');
    assert.match(body.markdown, /Example Title/);
    await app.close();
  });

  it('returns failure details for batch scrape', async () => {
    const app = buildServer();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/scrape/batch',
      payload: { urls: ['https://example.com/', 'https://failure.test/'] }
    });
    assert.equal(response.statusCode, 200);
    const { results } = response.json();
    assert.equal(results.length, 2);
    const failing = results.find((item) => item.url === 'https://failure.test/');
    assert.ok(failing);
    assert.equal(failing.success, false);
    assert.equal(typeof failing.error, 'string');
    assert.ok((failing.error ?? '').length > 0);
    await app.close();
  });

  it('runs search and returns parsed results', async () => {
    const app = buildServer();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/search',
      payload: { query: 'markdown testing' }
    });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.engine, 'duckduckgo');
    assert.equal(body.results.length, 1);
    assert.equal(body.results[0].url, 'https://example.com/post');
    assert.equal(body.results[0].title, 'Example result');
    await app.close();
  });

  it('validates request bodies', async () => {
    const app = buildServer();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/scrape/markdown',
      payload: { url: 'notaurl' }
    });
    assert.equal(response.statusCode, 400);
    await app.close();
  });
});
