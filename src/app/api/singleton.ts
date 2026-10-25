import { createDefaultApiContext, ApiContext } from '../../api/media-router';

declare global {
  var __saveFrameApiCtx: ApiContext | undefined;
}

export function getApiContext(): ApiContext {
  if (!global.__saveFrameApiCtx) {
    global.__saveFrameApiCtx = createDefaultApiContext();
  }
  return global.__saveFrameApiCtx;
}
