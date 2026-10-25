import { NextResponse } from 'next/server';
import { verificationFile } from '../../../../admin/verification';
export const dynamic='force-dynamic';
export async function GET(_request: Request,context:{params:Promise<{filename:string}>}) {
  const {filename}=await context.params, file=verificationFile(filename);
  if(!file) return new NextResponse('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
  return new NextResponse(file.content,{headers:{'Content-Type':file.mime_type,'Content-Length':String(Buffer.byteLength(file.content)),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'X-Robots-Tag':'noindex'}});
}
