/**
 * public/data/posts.json을 읽어 public/sitemap.xml을 생성합니다.
 * 새 글 추가 시 빌드 전에 자동 실행되면 sitemap이 항상 최신 상태로 유지됩니다.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const postsPath = path.join(__dirname, '../public/data/posts.json');
const sitemapPath = path.join(__dirname, '../public/sitemap.xml');

const BASE_URL = process.env.BASE_URL || process.env.VITE_APP_URL || 'https://btd-alarm2.pages.dev';

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toLastmod(dateStr) {
  if (!dateStr) return new Date().toISOString().slice(0, 10);
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}

const posts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));
const sorted = [...posts].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
const latestDate = sorted[0]?.date ? toLastmod(sorted[0].date) : new Date().toISOString().slice(0, 10);

const url = (path) => `${BASE_URL.replace(/\/$/, '')}${path.startsWith('/') ? path : '/' + path}`;

const urls = [
  { loc: url('/'), lastmod: latestDate, changefreq: 'weekly', priority: '1.0' },
  { loc: url('/posts'), lastmod: latestDate, changefreq: 'weekly', priority: '0.9' },
  ...posts.map((p) => ({
    loc: url(`/posts/${p.id}`),
    lastmod: toLastmod(p.date),
    changefreq: 'monthly',
    priority: '0.8',
  })),
];

const xml =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls
    .map(
      (u) =>
        '  <url>\n' +
        `    <loc>${escapeXml(u.loc)}</loc>\n` +
        `    <lastmod>${u.lastmod}</lastmod>\n` +
        `    <changefreq>${u.changefreq}</changefreq>\n` +
        `    <priority>${u.priority}</priority>\n` +
        '  </url>'
    )
    .join('\n') +
  '\n</urlset>\n';

fs.writeFileSync(sitemapPath, xml, 'utf8');
console.log(`Sitemap generated: ${sitemapPath} (${urls.length} URLs, base: ${BASE_URL})`);
