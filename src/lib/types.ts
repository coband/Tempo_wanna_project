export interface Book {
  id: string;
  title: string;
  author: string;
  isbn: string;
  level: string;
  subject: string;
  year: number;
  description: string;
  location: string;
  user_id: string;
  created_at: string;
  available: boolean;
  borrowed_at: string;
  borrowed_by: string;
  school: string;
  type: string;
}

export type NewBook = Omit<Book, 'id' | 'user_id' | 'created_at' | 'borrowed_at' | 'borrowed_by'> & {
  user_id?: string;
  borrowed_at?: string;
  borrowed_by?: string;
  created_at?: string;
  id?: string;
}; 