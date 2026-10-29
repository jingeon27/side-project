import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';

import type { IViewer } from '../auth/session/session.service';
import { Viewer } from '../auth/session/viewer.decorator';
import { ClientAddress } from '../rate-limit/client-address.decorator';
import {
  SubmissionService,
  type ICreateSubmissionInput,
  type ISubmissionListQuery,
} from './submission.service';

@Resolver('Submission')
export class SubmissionResolver {
  constructor(private readonly submissionService: SubmissionService) {}

  @Query()
  submissions(
    @Viewer() viewer: IViewer,
    @Args('contestId') contestId: string,
    @Args() query: ISubmissionListQuery,
  ) {
    return this.submissionService.list(viewer, contestId, query);
  }

  @Mutation()
  requestUploadUrl(
    @Viewer() viewer: IViewer,
    @Args('contestId') contestId: string,
    @Args('contentType') contentType: string,
    @Args('byteSize') byteSize: number,
    @ClientAddress() address: string | null,
  ) {
    return this.submissionService.requestUploadUrl(viewer, contestId, contentType, byteSize, address);
  }

  @Mutation()
  completeSubmissionUpload(@Viewer() viewer: IViewer, @Args('uploadId') uploadId: string) {
    return this.submissionService.completeUpload(viewer, uploadId);
  }

  @Mutation()
  createSubmission(@Viewer() viewer: IViewer, @Args() input: ICreateSubmissionInput) {
    return this.submissionService.create(viewer, input);
  }
}
