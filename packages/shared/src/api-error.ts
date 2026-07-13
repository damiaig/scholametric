/** Matches the API's global exception filter envelope (apps/api/src/common/filters). */
export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
  path: string;
  timestamp: string;
}
