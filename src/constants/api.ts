const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL;

export class UserManagement {
  static Authentication = class {
    static register: string = `${API_BASE_URL}/auth/register`;
    static login: string = `${API_BASE_URL}/auth/login`;
    static logout: string = `${API_BASE_URL}/auth/logout`;
  };

  static Actions = class {
    static users: string = `${API_BASE_URL}/users`;
    static user: string = `${API_BASE_URL}/user`;
    static userWithId: string = `${API_BASE_URL}/users/:id`;
  };
}

export class UrlShortening {
  /** The API's own redirect, still used as a fallback by the site's /r/:code page. */
  static redirect: string = `${API_BASE_URL}/r/`;
  /** Resolves a short code to its target as JSON (vb2007/vb2007.hu-api#75). */
  static lookup: string = `${API_BASE_URL}/shortenUrl/:shortenedUrl`;
  // Temporary: the API currently serves this at /shortenUrl/create; revert to /shortenUrl once it is fixed.
  static shortenUrl: string = `${API_BASE_URL}/shortenUrl/create`;
}

export class Pastebin {
  static paste: string = `${API_BASE_URL}/paste`;
  static pasteWithId: string = `${API_BASE_URL}/paste/:id`;
  static pastesByUsername: string = `${API_BASE_URL}/pastes/:username`;
}

/** The logged-in user's file uploads (vb2007/vb2007.hu-api#81 to #87). */
export class UserUploads {
  static uploads: string = `${API_BASE_URL}/uploads`;
  static usage: string = `${API_BASE_URL}/uploads/usage`;
  static upload: string = `${API_BASE_URL}/upload`;
  static uploadWithId: string = `${API_BASE_URL}/upload/:id`;
}

/** The superuser's admin endpoints (vb2007/vb2007.hu-api#120, #121). */
export class Admin {
  static users: string = `${API_BASE_URL}/admin/users`;
  static uploadQuota: string = `${API_BASE_URL}/admin/users/:id/upload-quota`;
}
