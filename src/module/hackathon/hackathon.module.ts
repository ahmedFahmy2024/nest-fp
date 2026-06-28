import { Module } from '@nestjs/common';
import { HackathonController } from './hackathon.controller';
import { HackathonService } from './hackathon.service';

@Module({
  controllers: [HackathonController],
  providers: [HackathonService],
})
export class HackathonModule {}
