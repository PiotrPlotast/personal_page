import type { APIRoute } from 'astro';

/** Lets every crawler in and points it at the sitemap on the site's own domain (`site` in astro.config.mjs). */
export const GET: APIRoute = ({ site }) =>
  new Response(
    ['User-agent: *', 'Allow: /', '', `Sitemap: ${new URL('sitemap-index.xml', site).href}`, ''].join('\n'),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
