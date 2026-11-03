// 개인 안내 (운영자 요청 2026-11-03: '루비로사에만 개인공지를 보내줘')
// 전체 공지(announcements)는 누구나 읽으므로, 한 교우에게만 보낼 안내는 여기에 적는다 (SQL 필요 없음).
// 받는 교우(@아이디)가 홈에 오면 창으로 뜨고('닫기'는 이번에만, '다시 보지 않기'를 누르면 그 안내 끝),
// 나온 지 SHOW_DAYS 일이 지나면 저절로 안 뜬다. 관리자는 설정 → 맨 아래 '개인 안내 미리 보기'로 본다.
// ★ 새 안내는 맨 위에 더한다 (id 는 겹치지 않게). 글 속 **굵게** 는 굵은 글씨로 보인다.

export type NoticeSection = {
  heading: string;
  text?: string;
  bullets?: string[];      // • 목록
  steps?: string[];        // ① ② ③ 차례
  note?: string;
};
export type PersonalNotice = {
  id: string;
  date: string;            // 'YYYY-MM-DD' (한국 날짜)
  handles: string[];       // 받는 교우 @아이디 (대소문자·띄어쓰기·_·.·- 무시)
  to: string;              // 부르는 이름 ('루비로사')
  title: string;
  intro?: string;
  sections: NoticeSection[];
  action?: 'sound';        // 아래 단추: 'sound' = 설정 → 알림 소리 열기
  sign?: string;
};

export const PERSONAL_NOTICES: PersonalNotice[] = [
  {
    id: 'rubyrosa-2026-11-03-2',
    date: '2026-11-03',
    handles: ['rubyrosa'],
    to: '루비로사',
    title: '정식 출시 뒤에 고칠 것들을 정리해 드려요',
    intro: '지금 쓰시는 Play 앱은 크롬(또는 삼성 인터넷)을 빌려 가톨릭그램 화면을 여는 방식이라, 화면을 고쳐서는 풀 수 없는 것들이 있어요. 지금 앱으로 **정식 출시를 먼저** 한 뒤, **가톨릭그램이 화면을 직접 여는 새 안드로이드 앱**으로 업데이트하면서 아래 것들을 한꺼번에 고칠게요.',
    sections: [
      {
        heading: '🔔 알림',
        bullets: [
          '설정 → 알림 소리에서 고른 소리(방울 등)가 **앱을 닫아 두었을 때도** 휴대폰 알림에 그대로 울려요. 휴대폰 설정에서 따로 바꾸지 않아도 돼요.',
          '휴대폰 알림이 **저절로 꺼지던 문제**가 없어져요. 인터넷 창이 아니라 앱이 직접 알림을 받아요.',
        ],
      },
      {
        heading: '📱 화면',
        bullets: [
          '휴대폰이 어두운 화면(다크 모드)일 때 가톨릭그램 화면이 **억지로 검게** 바뀌던 일이 없어져요.',
          '크롬의 **\'검색결과를 보려면 탭하세요\'** 띠가 더는 안 떠요.',
          '사진을 꾹 누르면 뜨던 **인터넷 창 메뉴**(\'삼성 브라우저에서 열기\' 등)가 없어지고 가톨릭그램 메뉴만 보여요.',
          '휴대폰 **뒤로가기**를 누르다 앱이 갑자기 꺼지던 일이 훨씬 줄어요.',
        ],
      },
      {
        heading: '📷 사진·음악',
        bullets: [
          '사진·동영상을 저장하면 휴대폰 **사진첩의 \'가톨릭그램\' 앨범**에 바로 들어가요.',
          '교우 공간의 **배경음악**이 휴대폰에 막히지 않고 들어가자마자 흘러요.',
        ],
      },
      {
        heading: '✅ 정식 출시되면 정리할 것',
        bullets: [
          '맨 위 **\'✓ Play 테스트 앱\'** 표시와 테스터 안내 글을 정리해요.',
        ],
      },
      {
        heading: '🙏 새 앱이 나오면 해 주실 일',
        steps: [
          'Play 스토어에서 가톨릭그램을 **업데이트**만 하시면 돼요. 새로 설치하지 않아도 돼요.',
          '처음 열 때 **알림 허용**을 물으면 \'허용\'을 눌러 주세요. 휴대폰에 따라 한 번 **다시 로그인**해야 할 수 있어요.',
          '바탕화면에 예전 가톨릭그램 아이콘이 남아 있으면 **지워 주세요.** 알림이 두 번 올 수 있어요.',
        ],
        note: '로그인할 때는 크롬 창이 잠깐 떴다가 앱으로 돌아와요(구글이 앱 안 로그인을 막아서 그래요). 삼성 휴대폰은 오래 안 쓴 앱을 \'절전\'으로 재워 알림이 늦게 올 수 있는데, 그때는 설정에서 빼는 방법을 함께 알려 드릴게요.',
      },
    ],
    sign: '가톨릭그램 운영자 드림',
  },
  {
    id: 'rubyrosa-2026-11-03',
    date: '2026-11-03',
    handles: ['rubyrosa'],
    to: '루비로사',
    title: '건의해 주신 두 가지를 알려 드려요',
    intro: '늘 꼼꼼히 써 보시고 알려 주셔서 고맙습니다 🙏',
    sections: [
      {
        heading: '💬 새 채팅에서 교우 찾기',
        text: '교우를 찾을 때 자판에 가려 찾은 교우가 잘 안 보이던 문제를 고쳤어요. 이름을 치는 동안에는 위쪽 칸이 접혀서 찾은 교우가 넓게 보이고, 이름이 똑같거나 그 말로 시작하는 교우가 맨 위에 나와요. 단체 채팅방을 만들 때 쓰던 **방 이름 칸과 아래 단추도 없앴어요**. 교우를 고른 뒤 오른쪽 위 **만들기**를 눌러 주세요. (방 이름은 방 안 ☰ 에서 바꿀 수 있어요)',
        note: '이 안내가 보이면 고친 버전이 이미 들어와 있어요.',
      },
      {
        heading: '🔔 앱을 닫아 두었을 때의 알림 소리',
        text: '설정 → 알림 소리에서 고르신 **방울**은 가톨릭그램을 **열어 두었을 때만** 울려요. 앱을 닫아 두었을 때 휴대폰 위쪽에 뜨는 알림은 휴대폰이 소리를 정하는데, 처음엔 **찬미예수님**으로 되어 있어요. 지금 방울로 바꾸시려면:',
        steps: [
          '설정 → 알림 소리 맨 아래 **① 소리 파일 받기**에서 **방울**을 눌러 받아요.',
          '바탕화면의 **가톨릭그램 아이콘을 꾹** → **ⓘ (애플리케이션 정보)** → 맨 위 **알림**(허용됨)',
          '그 화면 맨 아래 **알림 카테고리** → **가톨릭그램 알림** 글자 누르기 (오른쪽 스위치 말고)',
          '**소리** → 목록 위 **＋**(또는 **알림음 추가**) → **다운로드**에서 받은 **catholicgram-chime** 파일 고르기',
        ],
        note: '가톨릭그램이 정식 출시된 뒤 새 안드로이드 앱으로 바꿀 때, 앱에서 고른 소리가 휴대폰 알림에도 저절로 울리도록 함께 고칠게요.',
      },
    ],
    action: 'sound',
    sign: '가톨릭그램 운영자 드림',
  },
];

export const PERSONAL_SHOW_DAYS = 14;
const DAY = 86400_000;
const handleKey = (h: string) => h.toLowerCase().replace(/[\s._\-@]/g, '');
const noticeTime = (n: PersonalNotice) => Date.parse(`${n.date}T00:00:00+09:00`);

/** 이 교우에게 띄울 개인 안내 (다시 보지 않기·이번에 닫은 것·오래된 것 빼고, 최근 것부터) */
export function myPersonalNotices({ handle, hidden, closed, now = Date.now(), notices = PERSONAL_NOTICES }: {
  handle?: string | null; hidden: string[]; closed: string[]; now?: number; notices?: PersonalNotice[];
}): PersonalNotice[] {
  if (!handle) return [];
  const me = handleKey(handle);
  if (!me) return [];
  return notices.filter(n => {
    if (!n.handles.some(h => handleKey(h) === me)) return false;
    const t = noticeTime(n);
    if (!Number.isFinite(t) || t > now || now - t > PERSONAL_SHOW_DAYS * DAY) return false;
    return !hidden.includes(n.id) && !closed.includes(n.id);
  });
}

export const personalHiddenKey = (userId: string) => `personalNoticeHidden:${userId}`;
