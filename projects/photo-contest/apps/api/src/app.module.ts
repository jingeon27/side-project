import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { captureException } from '@sentry/node';
import depthLimit from 'graphql-depth-limit';
import { join } from 'node:path';
import { AnalyticsService } from './analytics';
import { Database } from './database';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { ContestService } from './contest.service';
import { FilesController } from './files.controller';
import { ContestResolver, DateTimeScalar } from './resolver';
@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      typePaths: [join(__dirname, '../src/schema.graphql')],
      playground: false,
      introspection: process.env.NODE_ENV !== 'production',
      csrfPrevention: true,
      formatError(formattedError) {
        if (formattedError.extensions?.code === 'INTERNAL_SERVER_ERROR') {
          captureException(new Error('GraphQL operation failed'));
          return {
            ...formattedError,
            message: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
            extensions: { code: 'INTERNAL_SERVER_ERROR' },
          };
        }
        return formattedError;
      },
      validationRules: [depthLimit(8)],
      context: ({ req }: { req: unknown }) => ({ req }),
    }),
  ],
  providers: [AnalyticsService, Database, AuthService, ContestService, ContestResolver, DateTimeScalar],
  controllers: [AuthController, FilesController],
})
export class AppModule {}
