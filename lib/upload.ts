import imageCompression from 'browser-image-compression';
import { supabase } from '@/lib/supabase';

// 사진 한 장을 줄여서(1.5MB, 긴 쪽 1920px 이하) 공개 사진 저장소에 올리고 주소를 돌려준다.
// prefix: 파일 이름 앞부분 (예: 'dm', 'feedback'). 주소는 무작위 이름이라 링크를 아는 사람만 볼 수 있다.
export async function uploadPhoto(file: File, prefix: string): Promise<string> {
  const compressed = await imageCompression(file, { maxSizeMB: 1.5, maxWidthOrHeight: 1920, useWebWorker: true });
  const name = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}.jpg`;
  const { error } = await supabase.storage.from('community-images').upload(name, compressed, { contentType: 'image/jpeg' });
  if (error) throw error;
  return supabase.storage.from('community-images').getPublicUrl(name).data.publicUrl;
}

// 사진만 보낸 메시지·건의의 글 자리 표시 (목록 미리보기·알림에 '📷 사진'으로 보임)
export const PHOTO_ONLY_TEXT = '📷 사진';
