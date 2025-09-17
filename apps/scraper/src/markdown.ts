import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  linkStyle: 'referenced'
});

turndown.addRule('stripScripts', {
  filter: ['script', 'style', 'noscript'],
  replacement: () => ''
});

turndown.keep(['table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td']);

export function htmlToMarkdown(html: string) {
  const dom = new JSDOM(html);
  const { document } = dom.window;
  const body = document.querySelector('body');
  if (!body) return '';
  return turndown.turndown(body.innerHTML);
}
