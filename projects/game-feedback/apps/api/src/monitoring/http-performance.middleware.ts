import { isEnabled, setHttpStatus, startSpanManual, updateSpanName, withIsolationScope } from '@sentry/node';
import type { NextFunction, Request, Response } from 'express';

import { isHealthProbe } from '../rate-limit';
import { chatHttpRoute, recordChatHttp } from './chat-metrics';
import { performanceMethod, performanceRoute } from './performance';

/** HTTP finishes when the response is written; an SSE connection's lifetime is not request latency. */
export function traceHttpRequest(req: Request, res: Response, next: NextFunction) {
  if (!isEnabled() || req.path.replace(/\/+$/, '') === '/api/chat/events' || isHealthProbe(req))
    return next();
  const started = performance.now();
  const chatRoute = chatHttpRoute(req.path);
  return withIsolationScope(() =>
    startSpanManual({ name: 'HTTP request', op: 'http.server', parentSpan: null }, (span) => {
      const handleComplete = () => {
        res.off('finish', handleComplete);
        res.off('close', handleComplete);
        const route = performanceRoute(req.route?.path);
        const method = performanceMethod(req.method);
        updateSpanName(span, `${method} ${route}`);
        span.setAttributes({ 'http.route': route, 'http.request.method': method });
        if (res.headersSent) setHttpStatus(span, res.statusCode);
        if (!res.writableFinished) {
          span.setAttribute('http.response.aborted', true);
          span.setStatus({ code: 2 });
        }
        if (chatRoute)
          recordChatHttp(
            chatRoute,
            req.method,
            res.statusCode,
            performance.now() - started,
            !res.writableFinished,
          );
        span.end();
      };
      res.once('finish', handleComplete);
      res.once('close', handleComplete);
      next();
    }),
  );
}
