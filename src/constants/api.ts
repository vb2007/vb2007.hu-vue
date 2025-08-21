const API_BASE_URL: string = import.meta.env.API_BASE_URL || "http://localhost:3000/";
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
