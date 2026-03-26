import { Controller, Get, Query } from '@nestjs/common';
import { UsageService } from './usage.service';

@Controller('usage')
export class UsageController {
  constructor(private readonly usageService: UsageService) {}

  @Get()
  getSummary(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.usageService.getSummary(parseInt(page, 10), parseInt(limit, 10));
  }
}
