import { isEnabled, setHttpStatus, startSpanManual, updateSpanName, withIsolationScope } from '@sentry/node';
import type { NextFunction, Request, Response } from 'express';

import { performanceRoute, recordHttpPerformance } from './performance';

export function traceHttpRequest(req: Request, res: Response, next: NextFunction) {
  if (!isEnabled() || /^\/health(?:\/|$)/.test(req.path)) return next();
  const started = performance.now();
  const graphql = /^\/graphql\/?$/.test(req.path);
  return withIsolationScope(() =>
    startSpanManual({ name: 'HTTP request', op: 'http.server', parentSpan: null }, (span) => {
      const handleComplete = () => {
        res.off('finish', handleComplete);
        res.off('close', handleComplete);
        const route = graphql ? '/graphql' : performanceRoute(req.route?.path);
        updateSpanName(span, `${req.method} ${route}`);
        span.setAttributes({ 'http.route': route, 'http.request.method': req.method });
        if (res.headersSent) setHttpStatus(span, res.statusCode);
        if (!res.writableFinished) span.setStatus({ code: 2 });
        recordHttpPerformance(
          route,
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
