declare namespace Express {
  interface Request {
    user?: {
      id: string;
      role: string | null;
      email: string | null;
      phone: string | null;
    };
  }
}
