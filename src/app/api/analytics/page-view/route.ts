import {NextResponse} from 'next/server';
import {siteUrl} from '../../../../lib/site';
import {recordPageView, trafficEnabled, trafficPermitted} from '../../../../admin/traffic-analytics';
export const runtime='nodejs';
const response=(status=204)=>new NextResponse(null,{status,headers:{'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'}});
let windowStart=0, requests=0;
export async function POST(request: Request) {
  if(request.headers.get('origin')!==siteUrl||request.headers.get('sec-fetch-site')==='cross-site')return response(403);
  if(!trafficEnabled()||!trafficPermitted(request.headers))return response();
  if(!request.headers.get('content-type')?.startsWith('application/json'))return response(415);
  if(Date.now()-windowStart>60000){windowStart=Date.now();requests=0;}
  if(++requests>3000)return response(429); // Bounded process-wide writes, without retaining IPs.
  const reader=request.body?.getReader();
  if(!reader)return response(400);
  let size=0, text='';const decoder=new TextDecoder();
  try {
    while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>1024){await reader.cancel();return response(413);}text+=decoder.decode(part.value,{stream:true});}
    const input=JSON.parse(text+decoder.decode());
    if(!input||typeof input.path!=='string'||input.path.length>240||Object.keys(input).some(key=>!['path','referrer','source','medium'].includes(key))||['referrer','source','medium'].some(key=>input[key]!==undefined&&(typeof input[key]!=='string'||input[key].length>64)))return response(400);
    recordPageView(request.headers,input);
  } catch { return response(); } // Best effort; storage failure never disrupts the website.
  return response();
}
