import * as sdk from '@sentry/node';

import { checkSentry } from '../../../../../scripts/check-sentry.mjs';
import { reportUnexpectedError, sentryOptions } from '../src/monitoring/sentry.ts';

await checkSentry({ sdk, options: sentryOptions(), report: reportUnexpectedError, service: 'photo-contest' });
