import { API_BASE_URL, Endpoints } from "@/constants/endpoints";
import { apiUrl } from "@/scripts/api/client";

/**
 * @deprecated The URLs of the calls not yet moved to `apiRequest`, derived from `Endpoints` so no
 * path is written twice. Each group goes once its calls move (#101 to #103); the file goes with #104.
 */
const legacy = (path: string) => `${API_BASE_URL}${path}`;

export class UrlShortening {
  /** Followed by the encoded code. */
  static redirect: string = apiUrl(Endpoints.ShortUrl.redirect, { params: { shortenedUrl: "" } });
  static lookup: string = legacy(Endpoints.ShortUrl.lookup.path);
  static shortenUrl: string = legacy(Endpoints.ShortUrl.create.path);
}
