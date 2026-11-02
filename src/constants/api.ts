import { API_BASE_URL, Endpoints } from "@/constants/endpoints";
import { apiUrl } from "@/scripts/api/client";

/**
 * @deprecated The URLs of the calls not yet moved to `apiRequest`, derived from `Endpoints` so no
 * path is written twice. Each group goes once its calls move (#101 to #103); the file goes with #104.
 */
const legacy = (path: string) => `${API_BASE_URL}${path}`;

export class UserManagement {
  /** Only the GitHub links and unlinking are left, which move with the account calls (#102). */
  static Authentication = class {
    static github: string = legacy(Endpoints.Auth.github.path);
    static githubLink: string = legacy(Endpoints.Auth.githubLink.path);
  };

  static Actions = class {
    /** Only deleting the account still uses it (#102). */
    static user: string = legacy(Endpoints.User.remove.path);
    static userEmail: string = legacy(Endpoints.User.changeEmail.path);
    static userPassword: string = legacy(Endpoints.User.changePassword.path);
    static userEmailConfirm: string = legacy(Endpoints.User.confirmEmail.path);
  };
}

export class UrlShortening {
  /** Followed by the encoded code. */
  static redirect: string = apiUrl(Endpoints.ShortUrl.redirect, { params: { shortenedUrl: "" } });
  static lookup: string = legacy(Endpoints.ShortUrl.lookup.path);
  static shortenUrl: string = legacy(Endpoints.ShortUrl.create.path);
}

export class UserUploads {
  static uploads: string = legacy(Endpoints.Uploads.list.path);
  static usage: string = legacy(Endpoints.Uploads.usage.path);
  static upload: string = legacy(Endpoints.Uploads.upload.path);
  static uploadWithId: string = legacy(Endpoints.Uploads.update.path);
}

export class Admin {
  static users: string = legacy(Endpoints.Admin.users.path);
  static uploadQuota: string = legacy(Endpoints.Admin.setUploadQuota.path);
  static userUploads: string = legacy(Endpoints.Admin.userUploads.path);
}
