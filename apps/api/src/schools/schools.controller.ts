import { Controller, Get, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../common/decorators/public.decorator";
import { SchoolsService, SchoolSearchResult } from "./schools.service";
import { SearchSchoolsDto } from "./dto/search-schools.dto";

@Controller("schools")
export class SchoolsController {
  constructor(private readonly schoolsService: SchoolsService) {}

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get("search")
  search(@Query() query: SearchSchoolsDto): Promise<SchoolSearchResult[]> {
    return this.schoolsService.search(query.q);
  }
}
