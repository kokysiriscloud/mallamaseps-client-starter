import { Controller, Get, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { AuthGuard } from './auth.guard';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  health() {
    return { ok: true, service: 'mallamaseps-api' };
  }

  @UseGuards(AuthGuard)
  @Get('private')
  getPrivate() {
    return { ok: true, message: 'Recurso privado mallamaseps-api' };
  }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
