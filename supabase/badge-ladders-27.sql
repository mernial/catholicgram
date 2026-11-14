-- 나머지 활동 27가지에도 7단계 등급 (운영자 2026-11-14 '1안'). 여러 번 실행해도 됩니다.
-- 단계 숫자를 넣고, 여기서 조용히 한 번 계산합니다 (여기서 계산하므로 휴대폰 알림은 가지 않음)
insert into public.badge_ladder_steps values
  ('prayed', 'prayers', 1, 20), ('prayed', 'prayers', 2, 60), ('prayed', 'prayers', 3, 200), ('prayed', 'prayers', 4, 600), ('prayed', 'prayers', 5, 1500), ('prayed', 'prayers', 6, 4000), ('prayed', 'prayers', 7, 8000),
  ('toppost', 'trophy', 1, 10), ('toppost', 'trophy', 2, 20), ('toppost', 'trophy', 3, 40), ('toppost', 'trophy', 4, 70), ('toppost', 'trophy', 5, 120), ('toppost', 'trophy', 6, 200), ('toppost', 'trophy', 7, 300),
  ('commentloved', 'comment_loved', 1, 10), ('commentloved', 'comment_loved', 2, 30), ('commentloved', 'comment_loved', 3, 100), ('commentloved', 'comment_loved', 4, 300), ('commentloved', 'comment_loved', 5, 800), ('commentloved', 'comment_loved', 6, 2000), ('commentloved', 'comment_loved', 7, 5000),
  ('followers', 'popular', 1, 5), ('followers', 'popular', 2, 15), ('followers', 'popular', 3, 30), ('followers', 'popular', 4, 60), ('followers', 'popular', 5, 100), ('followers', 'popular', 6, 200), ('followers', 'popular', 7, 400),
  ('following', 'friendly', 1, 5), ('following', 'friendly', 2, 15), ('following', 'friendly', 3, 30), ('following', 'friendly', 4, 60), ('following', 'friendly', 5, 100), ('following', 'friendly', 6, 200), ('following', 'friendly', 7, 400),
  ('cheer', 'cheer', 1, 30), ('cheer', 'cheer', 2, 100), ('cheer', 'cheer', 3, 300), ('cheer', 'cheer', 4, 1000), ('cheer', 'cheer', 5, 3000), ('cheer', 'cheer', 6, 7000), ('cheer', 'cheer', 7, 15000),
  ('reactor', 'reactor', 1, 30), ('reactor', 'reactor', 2, 100), ('reactor', 'reactor', 3, 300), ('reactor', 'reactor', 4, 1000), ('reactor', 'reactor', 5, 3000), ('reactor', 'reactor', 6, 7000), ('reactor', 'reactor', 7, 15000),
  ('messenger', 'messenger', 1, 30), ('messenger', 'messenger', 2, 100), ('messenger', 'messenger', 3, 300), ('messenger', 'messenger', 4, 1000), ('messenger', 'messenger', 5, 3000), ('messenger', 'messenger', 6, 7000), ('messenger', 'messenger', 7, 15000),
  ('groupchat', 'groupchat', 1, 30), ('groupchat', 'groupchat', 2, 100), ('groupchat', 'groupchat', 3, 300), ('groupchat', 'groupchat', 4, 1000), ('groupchat', 'groupchat', 5, 3000), ('groupchat', 'groupchat', 6, 7000), ('groupchat', 'groupchat', 7, 15000),
  ('lounge', 'lounge', 1, 10), ('lounge', 'lounge', 2, 50), ('lounge', 'lounge', 3, 150), ('lounge', 'lounge', 4, 400), ('lounge', 'lounge', 5, 1000), ('lounge', 'lounge', 6, 2500), ('lounge', 'lounge', 7, 5000),
  ('replier', 'replier', 1, 10), ('replier', 'replier', 2, 50), ('replier', 'replier', 3, 150), ('replier', 'replier', 4, 400), ('replier', 'replier', 5, 1000), ('replier', 'replier', 6, 2500), ('replier', 'replier', 7, 5000),
  ('sticker', 'sticker', 1, 20), ('sticker', 'sticker', 2, 60), ('sticker', 'sticker', 3, 200), ('sticker', 'sticker', 4, 600), ('sticker', 'sticker', 5, 1500), ('sticker', 'sticker', 6, 4000), ('sticker', 'sticker', 7, 8000),
  ('photo', 'photo', 1, 5), ('photo', 'photo', 2, 20), ('photo', 'photo', 3, 60), ('photo', 'photo', 4, 150), ('photo', 'photo', 5, 400), ('photo', 'photo', 6, 1000), ('photo', 'photo', 7, 2000),
  ('comforter', 'comforter', 1, 3), ('comforter', 'comforter', 2, 10), ('comforter', 'comforter', 3, 30), ('comforter', 'comforter', 4, 80), ('comforter', 'comforter', 5, 200), ('comforter', 'comforter', 6, 400), ('comforter', 'comforter', 7, 800),
  ('intention', 'intention', 1, 3), ('intention', 'intention', 2, 10), ('intention', 'intention', 3, 30), ('intention', 'intention', 4, 80), ('intention', 'intention', 5, 200), ('intention', 'intention', 6, 400), ('intention', 'intention', 7, 800),
  ('story', 'story', 1, 3), ('story', 'story', 2, 10), ('story', 'story', 3, 30), ('story', 'story', 4, 80), ('story', 'story', 5, 200), ('story', 'story', 6, 400), ('story', 'story', 7, 800),
  ('dj', 'dj', 1, 3), ('dj', 'dj', 2, 10), ('dj', 'dj', 3, 30), ('dj', 'dj', 4, 80), ('dj', 'dj', 5, 200), ('dj', 'dj', 6, 400), ('dj', 'dj', 7, 800),
  ('hashtag', 'hashtag', 1, 3), ('hashtag', 'hashtag', 2, 10), ('hashtag', 'hashtag', 3, 30), ('hashtag', 'hashtag', 4, 80), ('hashtag', 'hashtag', 5, 200), ('hashtag', 'hashtag', 6, 400), ('hashtag', 'hashtag', 7, 800),
  ('welcomer', 'welcomer', 1, 3), ('welcomer', 'welcomer', 2, 10), ('welcomer', 'welcomer', 3, 30), ('welcomer', 'welcomer', 4, 80), ('welcomer', 'welcomer', 5, 200), ('welcomer', 'welcomer', 6, 400), ('welcomer', 'welcomer', 7, 800),
  ('earlybird', 'earlybird', 1, 3), ('earlybird', 'earlybird', 2, 10), ('earlybird', 'earlybird', 3, 25), ('earlybird', 'earlybird', 4, 60), ('earlybird', 'earlybird', 5, 120), ('earlybird', 'earlybird', 6, 250), ('earlybird', 'earlybird', 7, 500),
  ('nightowl', 'nightowl', 1, 3), ('nightowl', 'nightowl', 2, 10), ('nightowl', 'nightowl', 3, 25), ('nightowl', 'nightowl', 4, 60), ('nightowl', 'nightowl', 5, 120), ('nightowl', 'nightowl', 6, 250), ('nightowl', 'nightowl', 7, 500),
  ('sunday', 'sunday', 1, 3), ('sunday', 'sunday', 2, 10), ('sunday', 'sunday', 3, 25), ('sunday', 'sunday', 4, 60), ('sunday', 'sunday', 5, 120), ('sunday', 'sunday', 6, 250), ('sunday', 'sunday', 7, 500),
  ('longform', 'longform', 1, 3), ('longform', 'longform', 2, 10), ('longform', 'longform', 3, 25), ('longform', 'longform', 4, 60), ('longform', 'longform', 5, 120), ('longform', 'longform', 6, 250), ('longform', 'longform', 7, 500),
  ('video', 'video', 1, 1), ('video', 'video', 2, 5), ('video', 'video', 3, 15), ('video', 'video', 4, 40), ('video', 'video', 5, 100), ('video', 'video', 6, 200), ('video', 'video', 7, 400),
  ('letter', 'letter', 1, 1), ('letter', 'letter', 2, 3), ('letter', 'letter', 3, 7), ('letter', 'letter', 4, 15), ('letter', 'letter', 5, 30), ('letter', 'letter', 6, 60), ('letter', 'letter', 7, 100),
  ('idea', 'idea', 1, 1), ('idea', 'idea', 2, 3), ('idea', 'idea', 3, 7), ('idea', 'idea', 4, 15), ('idea', 'idea', 5, 30), ('idea', 'idea', 6, 60), ('idea', 'idea', 7, 100),
  ('detective', 'detective', 1, 1), ('detective', 'detective', 2, 3), ('detective', 'detective', 3, 7), ('detective', 'detective', 4, 15), ('detective', 'detective', 5, 30), ('detective', 'detective', 6, 60), ('detective', 'detective', 7, 100)
on conflict (family, tier) do update set stat = excluded.stat, min_s = excluded.min_s;
select count(*) as 새로_달린_뱃지 from public.refresh_auto_badges();
