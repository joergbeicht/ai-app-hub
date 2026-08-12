import { Module } from '@nestjs/common';
import { GraphModule } from '../graph/graph.module';
import { TabletAuthController } from './tablet-auth.controller';
import { TabletAuthService } from './tablet-auth.service';
import { KeyVaultService } from './key-vault.service';
import { RopcTokenService } from './ropc-token.service';
import { TabletSessionTokenService } from './tablet-session-token.service';

@Module({
  imports: [GraphModule],
  controllers: [TabletAuthController],
  providers: [TabletAuthService, KeyVaultService, RopcTokenService, TabletSessionTokenService],
})
export class TabletAuthModule {}
