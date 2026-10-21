import imageCompression from 'browser-image-compression';
import { supabase } from '@/lib/supabase';

// 올린 파일은 이름이 매번 새로 정해지고 바뀌지 않으므로 휴대폰이 1년 동안 다시 받지 않게 한다 (전송량 절약)
export const UPLOAD_CACHE = '31536000';
// 휴대폰 화면(폭 약 1200px)에 충분한 크기로 줄인다
export const PHOTO_OPTIONS = { maxSizeMB: 0.6, maxWidthOrHeight: 1440, initialQuality: 0.82, useWebWorker: true };

// 사진 한 장을 줄여서(0.6MB, 긴 쪽 1440px 이하) 공개 사진 저장소에 올리고 주소를 돌려준다.
// prefix: 파일 이름 앞부분 (예: 'dm', 'feedback'). 주소는 무작위 이름이라 링크를 아는 사람만 볼 수 있다.
export async function uploadPhoto(file: File, prefix: string): Promise<string> {
  const compressed = await imageCompression(file, PHOTO_OPTIONS);
  const name = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}.jpg`;
  const { error } = await supabase.storage.from('community-images').upload(name, compressed, { contentType: 'image/jpeg', cacheControl: UPLOAD_CACHE });
  if (error) throw error;
  return supabase.storage.from('community-images').getPublicUrl(name).data.publicUrl;
}

// 사진만 보낸 메시지·건의의 글 자리 표시 (목록 미리보기·알림에 '📷 사진'으로 보임)
export const PHOTO_ONLY_TEXT = '📷 사진';
