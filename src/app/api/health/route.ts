import { NextResponse } from 'next/server';
import { getApiContext } from '../singleton';

async function inspect() {
  const ctx = getApiContext();
  const [bins, redis, storage] = await Promise.all([
    ctx.ytDlpService.checkHealth(),
    ctx.redisStore.checkHealth(),
    ctx.downloadManager.getStorageHealth(),
  ]);
  const ok = bins.ytDlp.ok && bins.ffmpeg.ok && storage.ok;
  return {ok,data:{
      status: ok ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - ctx.startedAt) / 1000),
      components: {
        nodejs: { ok: true, version: process.version },
        ytDlp: {ok:bins.ytDlp.ok,version:bins.ytDlp.version},
        ffmpeg: {ok:bins.ffmpeg.ok,version:bins.ffmpeg.version},
        redis,
        storage:{ok:storage.ok,freeFormatted:storage.freeFormatted,activeJobs:storage.activeJobs},
      },
    }};
}
let snapshot:Awaited<ReturnType<typeof inspect>>|undefined,expires=0;
let pending:ReturnType<typeof inspect>|undefined;
export async function GET(){
  if(!snapshot||Date.now()>=expires){pending ||=inspect();try{snapshot=await pending;expires=Date.now()+30000;}finally{pending=undefined;}}
  return NextResponse.json(snapshot.data,{status:snapshot.ok?200:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
