-- 건의함 사진 여러 장 (루비로사 건의 2026-11-02: '사진 선택이 한 장밖에 안 돼요')
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전)
-- 첫 장은 예전처럼 image_url 에도 들어가고(예전 앱도 보임), 2장 넘으면 모두 images 에 (10장까지)
alter table public.feedback add column if not exists images text[];
alter table public.feedback drop constraint if exists feedback_images_max;
alter table public.feedback add constraint feedback_images_max check (images is null or cardinality(images) <= 10);
notify pgrst, 'reload schema';

-- 확인: images 칸이 보이면 됨
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'feedback' and column_name = 'images';
