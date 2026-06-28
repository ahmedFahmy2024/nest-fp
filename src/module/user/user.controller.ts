import { Controller, Get, Param } from '@nestjs/common';
import { Roles } from '@thallesp/nestjs-better-auth';
import { UserService } from './user.service';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('all')
  @Roles(['ADMIN'])
  findAll() {
    return this.userService.findAll();
  }

  @Get(':id')
  @ResponseMessage('User fetched successfully')
  findById(@Param('id') id: string) {
    return this.userService.findById(id);
  }
}
