import { NextResponse } from 'next/server';
import axios from 'axios';

// Simple server-side scraper: fetch a yaldosry quran page and extract the first MP3 URL
// Query param: url (full yaldosry quran page, e.g. https://yaldosry.com/quran/3123)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const pageUrl = searchParams.get('url');

  if (!pageUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  try {
    const res = await axios.get(pageUrl);
    const html = res.data as string;

    // naive extraction: look for <audio> source or anchor download
    const mp3Match = html.match(/<source[^>]+src=["']([^"']+\.mp3)["']/i) || html.match(/href=["']([^"']+\.mp3)["']/i);
    if (mp3Match && mp3Match[1]) {
      return NextResponse.json({ mp3: mp3Match[1] });
    }

    return NextResponse.json({ error: 'MP3 not found on page' }, { status: 404 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Fetch error' }, { status: 500 });
  }
}
