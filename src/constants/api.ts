const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL || "https://api.vb2007.hu";
export const AUTH_COOKIE_NAME: string = "VB-AUTH=";

export class UserManagement {
  static Authentication = class {
    static register: string = `${API_BASE_URL}/auth/register`;
    static login: string = `${API_BASE_URL}/auth/login`;
  };

  static Actions = class {
    static getUsers: string = `${API_BASE_URL}/users`;
    static getUser: string = `${API_BASE_URL}/user`;
    static deletePatchUser: string = `${API_BASE_URL}/users/:id`;
  };
}

export class UrlShortening {
  static shortenUrl: string = `${API_BASE_URL}/shortenUrl/create`;
  // static getOriginalUrl: string =
  static deleteUrl: string = `${API_BASE_URL}/shortenUrl/delete`;
}
