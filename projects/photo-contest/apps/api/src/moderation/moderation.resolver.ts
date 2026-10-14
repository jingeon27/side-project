import { Args, Mutation, Resolver } from '@nestjs/graphql';

import type { IViewer } from '../auth/session.service';
import { Viewer } from '../auth/viewer.decorator';
import { ModerationService } from './moderation.service';

@Resolver()
export class ModerationResolver {
  constructor(private readonly moderationService: ModerationService) {}

  @Mutation()
  reportSubmission(
    @Viewer() viewer: IViewer,
    @Args('submissionId') submissionId: string,
    @Args('reason') reason: string,
  ) {
    return this.moderationService.report(viewer, submissionId, reason);
  }

  @Mutation()
  hideSubmission(@Viewer() viewer: IViewer, @Args('submissionId') submissionId: string) {
    return this.moderationService.hide(viewer, submissionId);
  }

  @Mutation()
  deleteSubmission(@Viewer() viewer: IViewer, @Args('submissionId') submissionId: string) {
    return this.moderationService.remove(viewer, submissionId);
  }
}
