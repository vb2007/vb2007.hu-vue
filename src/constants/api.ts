const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL || "https://api.vb2007.hu";
export const AUTH_COOKIE_NAME: string = "VB-AUTH=";

export class UserManagement {
  static Authentication = class {
    static register: string = `${API_BASE_URL}/auth/register`;
    static login: string = `${API_BASE_URL}/auth/login`;
  };

  static Actions = class {
    static users: string = `${API_BASE_URL}/users`;
    static user: string = `${API_BASE_URL}/user`;
    static userWithId: string = `${API_BASE_URL}/users/:id`;
  };
}

export class UrlShortening {
  static redirect: string = `${API_BASE_URL}/r/:id`;
  static shortenUrl: string = `${API_BASE_URL}/shortenUrl`;
}
