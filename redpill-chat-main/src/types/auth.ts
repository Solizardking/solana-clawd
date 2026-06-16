export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  credits: string;
}

export interface LoginResponse {
  message: string;
  user: CurrentUser;
}
