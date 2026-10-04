// 후원 배너 공통 타입 (supabase/sponsor-banners.sql)
export interface SponsorBannerData {
  id: string;
  sponsor_name: string;
  title: string;
  description: string | null;
  image_url: string | null;
  link_url: string | null;
  placement: 'top' | 'feed' | 'both';
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
  priority: number;
  impressions: number;
  clicks: number;
  created_at: string;
}

// 피드에서 게시글 몇 개마다 배너를 끼울지
export const FEED_BANNER_EVERY = 8;
