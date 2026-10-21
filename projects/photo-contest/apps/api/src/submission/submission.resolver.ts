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
  uploadSubmissionPhoto(
    @Viewer() viewer: IViewer,
    @Args('uploadId') uploadId: string,
    @Args('file') file: Promise<FileUpload>,
  ) {
    return this.submissionService.uploadFile(viewer, uploadId, file);
  }

  @Mutation()
  requestUploadUrl(@Viewer() viewer: IViewer, @Args('contestId') contestId: string) {
    return this.submissionService.requestUploadUrl(viewer, contestId);
  }

  @Mutation()
  createSubmission(@Viewer() viewer: IViewer, @Args() input: ICreateSubmissionInput) {
    return this.submissionService.create(viewer, input);
  }
}
