import { NextResponse } from 'next/server';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

function normalize(s: string) {
  return (s || '').replace(/[\u064B-\u0652]/g, '') // remove tashkeel
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim().toLowerCase();
}

export async function GET(req: Request) {
  try {
    // get official surah list
    const surahRes = await axios.get('https://api.alquran.cloud/v1/surah');
    const surahs = surahRes.data.data || [];

    const collectionUrl = 'https://yaldosry.com/quran/c/215';
    const colRes = await axios.get(collectionUrl, { timeout: 15000 });
    const html = colRes.data as string;

    const anchorRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    const candidates: {href:string,inner:string}[] = [];
    for (const m of html.matchAll(anchorRegex)) {
      const href = m[1];
      const inner = (m[2]||'').replace(/<[^>]+>/g,'').trim();
      if (href && href.indexOf('/quran/') !== -1) candidates.push({ href, inner });
    }

    const map: Record<number,string> = {};

    for (const c of candidates) {
      try {
        let pageUrl = c.href.startsWith('http') ? c.href : 'https://yaldosry.com' + c.href;
        const pRes = await axios.get(pageUrl, { timeout: 15000 });
        const pageHtml = pRes.data as string;
        const mp3Match = pageHtml.match(/<source[^>]+src=["']([^"']+\.mp3)["']/i) || pageHtml.match(/href=["']([^"']+\.mp3)["']/i);
        if (!mp3Match || !mp3Match[1]) continue;
        const mp3 = mp3Match[1];

        // try extract title or h2.title
        let title = c.inner;
        const titleMatch = pageHtml.match(/<h2[^>]*class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i) || pageHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        if (titleMatch && titleMatch[1]) title = titleMatch[1].replace(/<[^>]+>/g,'').trim();

        const normTitle = normalize(title);
        // try match to surahs
        let found = surahs.find((s:any) => {
          const name = (s.name || '').replace(/^سُورَةُ\s*/,'');
          return normalize(name) === normTitle || normTitle.indexOf(normalize(name)) !== -1 || normalize(name).indexOf(normTitle) !== -1;
        });

        if (found) {
          map[found.number] = mp3;
        }
      } catch (e) {
        // continue on individual page errors
        continue;
      }
    }

    // write to data/yaldosry_map.json
    const outDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
    const outPath = path.join(outDir, 'yaldosry_map.json');
    fs.writeFileSync(outPath, JSON.stringify(map, null, 2), 'utf8');

    return NextResponse.json({ success: true, count: Object.keys(map).length });
  } catch (err:any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
