import { Module } from '@nestjs/common';
import { GraphModule } from '../graph/graph.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [GraphModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
