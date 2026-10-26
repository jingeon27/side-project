import * as sdk from '@sentry/node';

import { checkSentry } from '@side/toolkit/sentry-check';

import { reportUnexpectedError, sentryOptions } from '../src/monitoring/sentry.ts';

await checkSentry({ sdk, options: sentryOptions(), report: reportUnexpectedError, service: 'photo-contest' });
