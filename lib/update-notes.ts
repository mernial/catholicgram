// 업데이트 소식 (운영자 요청 2026-10-31): 앱이 바뀌면 고친 오류·새로 생긴 기능·바뀐 점을 교우에게 알린다.
// 앱을 열면 창으로 뜨고('닫기'는 이번에만, '다시 보지 않기'를 누르면 그 소식은 다시 안 뜸), 지난 소식은 설정 → 버전 정보에서 다시 본다.
// ★ 교우가 느낄 수 있는 업데이트를 올릴 때마다 맨 위에 새 덩이를 더한다 (id 는 겹치지 않게 — 같은 날 두 번째면 '-2').
//   교우가 읽는 쉬운 말로, 관리자만 쓰는 기능은 adminOnly. 이미 나간 소식에 줄을 더하지 않는다(이미 '다시 보지 않기'한 교우가 못 봄).

export type UpdateItem = { text: string; adminOnly?: boolean };
export type UpdateNote = {
  id: string;
  date: string; // 'YYYY-MM-DD' (한국 날짜)
  fixed?: UpdateItem[];   // 🛠 고친 것
  added?: UpdateItem[];   // ✨ 새로 생긴 것
  changed?: UpdateItem[]; // 🔄 바뀐 것
};

export const UPDATE_NOTES: UpdateNote[] = [
  {
    id: '2026-10-31',
    date: '2026-10-31',
    added: [
      { text: '업데이트 소식: 앱이 새로워지면 이렇게 고친 것과 새로 생긴 것을 알려 드려요. \'다시 보지 않기\'를 누르면 그 소식은 다시 뜨지 않아요.' },
      { text: '설정 → 버전 정보: 지금 쓰는 버전과 새 버전이 나왔는지 볼 수 있어요. 지난 업데이트 소식도 여기서 다시 볼 수 있어요.' },
    ],
  },
  {
    id: '2026-10-30',
    date: '2026-10-30',
    fixed: [
      { text: '휴대폰 알림이 저절로 꺼지는 일을 줄였어요. 그래도 자꾸 꺼지면 알림창의 \'휴대폰 알림이 자꾸 꺼지나요? 해결 방법\'을 눌러 보세요.' },
      { text: '아이폰·아이패드: 보고 있는 대화방의 메시지가 휴대폰 알림으로 또 뜨던 문제를 고쳤어요.' },
      { text: '휴대폰이 다크 모드일 때 고른 화면 색과 다르게 어둡게 보이던 문제를 고쳤어요. (설정 → 화면 색 → \'휴대폰 설정 따라가기\')' },
    ],
    added: [
      { text: '대화방에 날이 바뀌면 \'2026년 10월 30일 금요일\'처럼 날짜 줄이 보여요. (1:1·단체방·사랑방)' },
      { text: '대화 내용 찾기: 대화방 위의 돋보기를 눌러 지난 대화를 찾을 수 있어요.' },
      { text: '알림 소리 고르기: 설정 → 알림 소리에서 찬미예수님·성당 종소리·하프 등 여러 소리 중에 고를 수 있어요.' },
      { text: '사진 효과: 글쓰기에서 사진의 \'효과\'를 누르면 자르기·이모티콘 붙이기·얼굴 모자이크를 할 수 있어요.' },
    ],
    changed: [
      { text: '게시글의 댓글 단추가 말풍선 모양으로 바뀌었어요. 메시지는 교우의 사진을 눌러 프로필에서 보낼 수 있어요.' },
    ],
  },
  {
    id: '2026-10-29',
    date: '2026-10-29',
    fixed: [
      { text: '아이폰에서 글을 치다 이미 쓴 글자가 사라지던 문제를 고쳤어요.' },
      { text: '한글을 칠 때 글자가 잠깐 빈칸으로 보이던 문제를 고쳤어요.' },
      { text: '대화방의 묶음 사진을 저장하면 1장만 저장되던 문제를 고쳤어요.' },
      { text: '이모티콘과 글을 함께 보내면 메시지가 둘로 나뉘어 가던 문제를 고쳤어요.' },
      { text: '아이패드에서 같은 알림이 배너로 두 번 뜨던 문제를 고쳤어요.' },
    ],
    added: [
      { text: '내 공간 배경음악: 관리자가 선물한 노래를 내 공간에 틀 수 있어요.' },
      { text: '게시글 음악 즐겨찾기: 음악을 고를 때 ☆를 눌러 자주 쓰는 곡을 모아 둘 수 있어요.' },
    ],
    changed: [
      { text: '기도·공감 숫자가 단추 바로 옆에 보여요.' },
      { text: '앱을 30분 넘게 떠났다 다시 열면 홈부터, 30분 안이면 보던 화면 그대로 보여요.' },
    ],
  },
];

export const UPDATE_SHOW_DAYS = 14; // 나온 뒤 이만큼 지난 소식은 저절로 띄우지 않음 (설정에서는 볼 수 있음)
const DAY = 86400_000;
export const noteTime = (n: UpdateNote) => Date.parse(`${n.date}T00:00:00+09:00`);

// 관리자만 쓰는 줄은 관리자에게만, 보일 줄이 하나도 없는 소식은 뺀다
export function visibleNotes(isAdmin: boolean, notes: UpdateNote[] = UPDATE_NOTES): UpdateNote[] {
  const keep = (items?: UpdateItem[]) => items?.filter(i => isAdmin || !i.adminOnly);
  return notes
    .map(n => ({ ...n, fixed: keep(n.fixed), added: keep(n.added), changed: keep(n.changed) }))
    .filter(n => (n.fixed?.length || 0) + (n.added?.length || 0) + (n.changed?.length || 0) > 0);
}

// 앱을 열 때 띄울 소식: 최근 소식 중 '다시 보지 않기'·이번에 '닫기'하지 않은 것 (가입하기 전에 지난 날의 소식은 빼고)
export function pendingNotes({ isAdmin, hidden, closed, joinedAt, now = Date.now() }: {
  isAdmin: boolean; hidden: string[]; closed: string[]; joinedAt?: string | null; now?: number;
}): UpdateNote[] {
  const joined = joinedAt ? Date.parse(joinedAt) : NaN;
  return visibleNotes(isAdmin).filter(n => {
    const t = noteTime(n);
    if (!Number.isFinite(t) || now - t > UPDATE_SHOW_DAYS * DAY || t > now) return false;
    if (Number.isFinite(joined) && joined > t + DAY) return false;
    return !hidden.includes(n.id) && !closed.includes(n.id);
  });
}

export const hiddenNotesKey = (userId: string) => `updateNotesHidden:${userId}`;

// '10월 31일' (한국 날짜)
export const noteDateLabel = (n: UpdateNote) => {
  const [, m, d] = n.date.split('-').map(Number);
  return m && d ? `${m}월 ${d}일` : n.date;
};
