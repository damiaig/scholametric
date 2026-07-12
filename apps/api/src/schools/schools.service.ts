import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 10;

export interface SchoolSearchResult {
  id: string;
  name: string;
  slug: string;
}

@Injectable()
export class SchoolsService {
  constructor(private readonly prisma: PrismaService) {}

  async search(q: string | undefined): Promise<SchoolSearchResult[]> {
    const query = (q ?? "").trim();
    if (query.length < MIN_QUERY_LENGTH) {
      return [];
    }

    return this.prisma.school.findMany({
      where: {
        status: "ACTIVE",
        OR: [{ name: { contains: query, mode: "insensitive" } }, { slug: { contains: query, mode: "insensitive" } }],
      },
      select: { id: true, name: true, slug: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: MAX_RESULTS,
    });
  }
}
