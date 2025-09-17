import { createLogger } from '@clone/shared';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import Fastify from 'fastify';
import { z } from 'zod';

import { config } from './config.js';
import { batchScrape, scrapeHtml, scrapeMarkdown } from './scrape.js';
import { runSearch, runSearchBatch } from './search.js';

const urlBodySchema = z.object({
  url: z.string().url()
});

const batchSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(10)
});

const searchSchema = z.object({
  query: z.string().min(1),
  engine: z.enum(['duckduckgo', 'google', 'bing']).optional(),
  cursor: z.string().optional()
});

const searchBatchSchema = z.object({
  queries: z
    .array(
      z.object({
        query: z.string().min(1),
        engine: z.enum(['duckduckgo', 'google', 'bing']).optional(),
        cursor: z.string().optional()
      })
    )
    .min(1)
    .max(10)
});

export function buildServer() {
  const app = Fastify({ logger: false });

  if (config.enableCors) {
    app.register(cors, { origin: true });
  }
  app.register(sensible);

  app.get('/health', async () => ({ status: 'ok' }));

  app.post('/v1/scrape/html', async (request, reply) => {
    const parsed = urlBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw app.httpErrors.badRequest(parsed.error.message);
    }

    const result = await scrapeHtml(parsed.data.url);
    reply.send({
      url: result.url,
      status: result.status,
      headers: result.headers,
      html: result.html
    });
  });

  app.post('/v1/scrape/markdown', async (request, reply) => {
    const parsed = urlBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw app.httpErrors.badRequest(parsed.error.message);
    }

    const result = await scrapeMarkdown(parsed.data.url);
    reply.send({
      url: result.url,
      status: result.status,
      headers: result.headers,
      markdown: result.markdown
    });
  });

  app.post('/v1/scrape/batch', async (request, reply) => {
    const parsed = batchSchema.safeParse(request.body);
    if (!parsed.success) {
      throw app.httpErrors.badRequest(parsed.error.message);
    }

    const results = await batchScrape(parsed.data.urls);
    reply.send({ results });
  });

  app.post('/v1/search', async (request, reply) => {
    const parsed = searchSchema.safeParse(request.body);
    if (!parsed.success) {
      throw app.httpErrors.badRequest(parsed.error.message);
    }

    const result = await runSearch({
      query: parsed.data.query,
      engine: parsed.data.engine ?? 'duckduckgo',
      cursor: parsed.data.cursor
    });
    reply.send(result);
  });

  app.post('/v1/search/batch', async (request, reply) => {
    const parsed = searchBatchSchema.safeParse(request.body);
    if (!parsed.success) {
      throw app.httpErrors.badRequest(parsed.error.message);
    }

    const mapped = parsed.data.queries.map((entry) => ({
      query: entry.query,
      engine: entry.engine ?? 'duckduckgo',
      cursor: entry.cursor
    }));
    const results = await runSearchBatch(mapped);
    reply.send({ results });
  });

  return app;
}

export async function start() {
  const logger = createLogger({ service: 'scraper' });
  const server = buildServer();
  try {
    await server.listen({ port: config.port, host: config.host });
    logger.info({ port: config.port, host: config.host }, 'Scraper service listening');
  } catch (error) {
    logger.error(error, 'Failed to start scraper service');
    process.exit(1);
  }
}
