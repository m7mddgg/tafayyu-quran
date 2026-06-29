import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const file = path.join(process.cwd(), 'data', 'yaldosry_map.json');
    if (!fs.existsSync(file)) return NextResponse.json({ error: 'map not found' }, { status: 404 });
    const raw = fs.readFileSync(file, 'utf8');
    const json = JSON.parse(raw || '{}');
    return NextResponse.json(json);
  } catch (e:any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
