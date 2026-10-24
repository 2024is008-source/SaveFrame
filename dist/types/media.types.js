"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.DownloaderAppError = void 0;
class DownloaderAppError extends Error {
  constructor(code, userMessage, statusCode = 400, retryable = false, internalMessage) {
    super(internalMessage || userMessage);
    this.name = 'DownloaderAppError';
    this.code = code;
    this.userMessage = userMessage;
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}
exports.DownloaderAppError = DownloaderAppError;