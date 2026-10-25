import { DownloaderAppError } from '../types/media.types';

/** Bound request buffering before parsing; Nginx is an additional limit, not a substitute. */
export async function readMediaJson(request: Request): Promise<Record<string, any>> {
  const reader=request.body?.getReader();
  if(!reader)throw new DownloaderAppError('INVALID_URL','Send a JSON request body.',400);
  let size=0,text='';const decoder=new TextDecoder();
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>16384){await reader.cancel();throw new DownloaderAppError('INVALID_URL','Request payload is too large.',413);}text+=decoder.decode(part.value,{stream:true});}
  try{const value=JSON.parse(text+decoder.decode());if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{throw new DownloaderAppError('INVALID_URL','Request body must be a JSON object.',400);}
}
