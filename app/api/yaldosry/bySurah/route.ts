import { NextResponse } from 'next/server';
import axios from 'axios';

function normalizeArabic(s: string) {
  if (!s) return '';
  // remove common Arabic diacritics/tashkeel and punctuation, normalize spaces
  return s
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '')
    .replace(/[\u0600-\u0605\u06DD\u06DE\u06E9\u06FD\u06FE\uFD3E\uFD3F\uFD3C\uFD3D\u200C]/g, '')
    .replace(/[\u0621-\u063A\u0641-\u064A\u0660-\u0669\u06F0-\u06F9\s]+/g, (m) => m.trim())
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get('name');
  if (!name) {
    return NextResponse.json({ error: 'Missing name parameter' }, { status: 400 });
  }

  try {
    const collectionUrl = 'https://yaldosry.com/quran/c/215';
    const colRes = await axios.get(collectionUrl, { timeout: 10000 });
    const html = colRes.data as string;

    const normTarget = normalizeArabic(name);

    // find anchors
    const anchorRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let href: string | null = null;
    let debugCandidates: any[] = [];

    for (const m of html.matchAll(anchorRegex)) {
      const candidateHref = m[1];
      const inner = (m[2] || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      const normInner = normalizeArabic(inner);
      debugCandidates.push({ href: candidateHref, inner, normInner });
      if (normInner && normInner.indexOf(normTarget) !== -1) {
        href = candidateHref;
        break;
      }
    }

    if (!href) {
      return NextResponse.json({ error: 'Surah link not found in collection', tried: { name, normTarget, candidates: debugCandidates.slice(0,10) } }, { status: 404 });
    }

    if (!href.startsWith('http')) href = 'https://yaldosry.com' + href;
    const pageRes = await axios.get(href, { timeout: 10000 });
    const pageHtml = pageRes.data as string;

    const mp3Match = pageHtml.match(/<source[^>]+src=["']([^"']+\.mp3)["']/i) || pageHtml.match(/href=["']([^"']+\.mp3)["']/i);
    if (mp3Match && mp3Match[1]) {
      return NextResponse.json({ mp3: mp3Match[1], href });
    }

    return NextResponse.json({ error: 'MP3 not found on page', href }, { status: 404 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Fetch error' }, { status: 500 });
  }
}
