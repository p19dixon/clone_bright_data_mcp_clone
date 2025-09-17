'use strict';
import axios from 'axios';

const SCRAPER_BASE_URL = process.env.SCRAPER_BASE_URL || 'http://127.0.0.1:8801';
const SCRAPER_TIMEOUT_MS = Number.parseInt(process.env.SCRAPER_TIMEOUT_MS || '20000', 10);

const client = axios.create({
  baseURL: SCRAPER_BASE_URL,
  timeout: SCRAPER_TIMEOUT_MS,
  headers: {
    'user-agent': 'BrightData-Clone-MCP/0.1',
    'content-type': 'application/json'
  }
});

function extractErrorMessage(error) {
  if (error.response) {
    const body = error.response.data;
    const message = typeof body === 'string' ? body : JSON.stringify(body);
    return `Scraper service error (${error.response.status}): ${message}`;
  }
  return error.message || 'Unknown scraper service error';
}

export async function fetchHtml(url) {
  try {
    const { data } = await client.post('/v1/scrape/html', { url });
    if (!data?.html) throw new Error('Invalid response from scraper service');
    return data;
  }
  catch (error) {
    throw new Error(extractErrorMessage(error));
  }
}

export async function fetchMarkdown(url) {
  try {
    const { data } = await client.post('/v1/scrape/markdown', { url });
    if (!data?.markdown) throw new Error('Invalid response from scraper service');
    return data;
  }
  catch (error) {
    throw new Error(extractErrorMessage(error));
  }
}

export async function fetchBatchMarkdown(urls) {
  try {
    const { data } = await client.post('/v1/scrape/batch', { urls });
    if (!data?.results) throw new Error('Invalid response from scraper service');
    return data.results;
  }
  catch (error) {
    throw new Error(extractErrorMessage(error));
  }
}

export async function search(query, engine, cursor) {
  try {
    const { data } = await client.post('/v1/search', { query, engine, cursor });
    if (!data?.results) throw new Error('Invalid search response from scraper service');
    return data;
  }
  catch (error) {
    throw new Error(extractErrorMessage(error));
  }
}

export async function searchBatch(queries) {
  try {
    const { data } = await client.post('/v1/search/batch', { queries });
    if (!data?.results) throw new Error('Invalid search batch response from scraper service');
    return data.results;
  }
  catch (error) {
    throw new Error(extractErrorMessage(error));
  }
}
