import type { APIRoute } from 'astro';
import { feed } from '~/lib/rss';

export const GET: APIRoute = (context) => feed(context, 'pl');
