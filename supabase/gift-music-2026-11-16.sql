-- 운영자 선물용(비공개) 음악 3곡 (2026-11-16) — 파일은 저장소 public/bgm/gift/ (Suno 꼬리표 지움)
-- '🔒 보관 음악 (선물용)'에 들어감: private = true, active = false → 공개 목록에는 안 보이고, 곡마다 🎁 선물하기
-- 여러 번 실행해도 한 번만 들어감
insert into public.bgm_tracks (title, artist, url, active, sort, private)
select v.title, '가톨릭그램', v.url, false, v.sort, true
from (values
  ('다른 길 위에서도', '/bgm/gift/g6ad671345247.mp3', -1003),
  ('이제는 네가 기대어도 돼', '/bgm/gift/gbe88aad8e719.mp3', -1002),
  ('잠시 쉬어도 괜찮아요', '/bgm/gift/g0b75fff88156.mp3', -1001)
) as v(title, url, sort)
where not exists (select 1 from public.bgm_tracks b where b.url = v.url);
-- 확인: 아래에 세 곡이 private = true 로 보이면 됨
select title, private, active from public.bgm_tracks where url like '/bgm/gift/%' order by sort;
