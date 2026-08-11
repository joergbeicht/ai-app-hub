import { Module } from '@nestjs/common';
import { GraphModule } from '../graph/graph.module';
import { BadgeLoginController } from './badge-login.controller';
import { BadgeLoginService } from './badge-login.service';

@Module({
  imports: [GraphModule],
  controllers: [BadgeLoginController],
  providers: [BadgeLoginService],
})
export class BadgeLoginModule {}
