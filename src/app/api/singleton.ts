import { createDefaultApiContext, ApiContext } from '../../api/media-router';

declare global {
  // eslint-disable-next-line no-var
  var __saveFrameApiCtx: ApiContext | undefined;
}

export function getApiContext(): ApiContext {
  if (!global.__saveFrameApiCtx) {
    global.__saveFrameApiCtx = createDefaultApiContext();
  }
  return global.__saveFrameApiCtx;
}
