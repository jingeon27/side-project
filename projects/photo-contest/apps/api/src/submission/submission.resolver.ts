import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { FileUpload } from 'graphql-upload/processRequest.mjs';

import type { IViewer } from '../auth/session.service';
import { Viewer } from '../auth/viewer.decorator';
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
  ) {
    return this.submissionService.requestUploadUrl(viewer, contestId, contentType, byteSize);
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
