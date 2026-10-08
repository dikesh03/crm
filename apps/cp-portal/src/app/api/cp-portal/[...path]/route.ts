import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

async function proxy(request: NextRequest, path: string[]) {
  const incomingUrl = new URL(request.url);
  const destination = `${BACKEND_URL}/api/cp-portal/${path.map(encodeURIComponent).join('/')}${incomingUrl.search}`;
  const headers = new Headers();
  const cookie = request.headers.get('cookie');
  const contentType = request.headers.get('content-type');
  if (cookie) headers.set('cookie', cookie);
  if (contentType) headers.set('content-type', contentType);

  const response = await fetch(destination, {
    method: request.method,
    headers,
    ...(request.method === 'GET' || request.method === 'HEAD' ? {} : { body: await request.arrayBuffer() }),
    cache: 'no-store',
  });
  const body = await response.arrayBuffer();
  const result = new NextResponse(body, { status: response.status, statusText: response.statusText });
  const responseType = response.headers.get('content-type');
  const setCookie = response.headers.get('set-cookie');
  if (responseType) result.headers.set('content-type', responseType);
  if (setCookie) result.headers.set('set-cookie', setCookie);
  return result;
}

type RouteContext = { params: { path: string[] } };

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    return await proxy(request, params.path);
  } catch (error) {
    console.error('CP Portal API proxy GET failed:', error);
    return NextResponse.json({ success: false, error: 'Unable to connect to CRM services' }, { status: 502 });
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    return await proxy(request, params.path);
  } catch (error) {
    console.error('CP Portal API proxy POST failed:', error);
    return NextResponse.json({ success: false, error: 'Unable to connect to CRM services' }, { status: 502 });
  }
}
