export type Comment = {
  id: string;
  author: string;
  text: string;
};

export type Post = {
  id: string;
  author: string;
  handle: string;
  initials: string;
  createdAt: string;
  text: string;
  images: string[];
  prayers: number;
  empathy: number;
  comments: Comment[];
  prayed: boolean;
  empathized: boolean;
};
