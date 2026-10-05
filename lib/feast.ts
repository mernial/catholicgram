// 축일(주보성인 축일) 관련 도우미
// 축일은 'MM-DD' 형식 문자열로 저장한다. (예: '09-29')

export const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const isValidFeastDay = (value?: string | null): value is string => {
  if (!value || !/^\d{2}-\d{2}$/.test(value)) return false;
  const [m, d] = value.split('-').map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= DAYS_IN_MONTH[m - 1];
};

export const formatFeastDay = (value?: string | null) => {
  if (!isValidFeastDay(value)) return '';
  const [m, d] = value.split('-').map(Number);
  return `${m}월 ${d}일`;
};

export const toFeastDay = (month: number, day: number) =>
  `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

// 한국 시간 기준 오늘의 축일 키 목록
// (2월 29일이 축일인 분은 윤년이 아닌 해에는 2월 28일에 함께 축하)
export const todayFeastKeys = (now = new Date()) => {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const key = toFeastDay(kst.getUTCMonth() + 1, kst.getUTCDate());
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return key === '02-28' && !leap ? [key, '02-29'] : [key];
};

// 한국 시간 기준 오늘 날짜 'YYYY-MM-DD'
export const todayKst = (now = new Date()) =>
  new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

type FeastOption = { saint: string; date: string };

// 자주 쓰는 세례명의 대표 축일 (같은 이름의 성인이 여럿이면 함께 보여준다)
const SAINT_FEASTS: Record<string, FeastOption[]> = {
  미카엘: [{ saint: '성 미카엘 대천사', date: '09-29' }],
  가브리엘: [{ saint: '성 가브리엘 대천사', date: '09-29' }],
  라파엘: [{ saint: '성 라파엘 대천사', date: '09-29' }],
  요셉: [{ saint: '성 요셉', date: '03-19' }, { saint: '노동자 성 요셉', date: '05-01' }],
  마리아: [{ saint: '천주의 성모 마리아', date: '01-01' }, { saint: '성모 승천', date: '08-15' }, { saint: '복되신 동정 마리아 탄생', date: '09-08' }],
  막달레나: [{ saint: '성녀 마리아 막달레나', date: '07-22' }],
  베드로: [{ saint: '성 베드로 사도', date: '06-29' }],
  바오로: [{ saint: '성 바오로 사도', date: '06-29' }, { saint: '성 정하상 바오로 (한국 순교자)', date: '09-20' }],
  안드레아: [{ saint: '성 안드레아 사도', date: '11-30' }, { saint: '성 김대건 안드레아 사제', date: '07-05' }],
  요한: [{ saint: '성 요한 사도', date: '12-27' }, { saint: '성 요한 세례자 탄생', date: '06-24' }, { saint: '성 요한 보스코', date: '01-31' }, { saint: '성 요한 마리아 비안네', date: '08-04' }],
  요한바오로: [{ saint: '성 요한 바오로 2세 교황', date: '10-22' }],
  야고보: [{ saint: '성 대 야고보 사도', date: '07-25' }, { saint: '성 필립보와 성 야고보 사도', date: '05-03' }],
  필립보: [{ saint: '성 필립보와 성 야고보 사도', date: '05-03' }],
  토마스: [{ saint: '성 토마스 사도', date: '07-03' }, { saint: '성 토마스 아퀴나스', date: '01-28' }, { saint: '성 토마스 모어', date: '06-22' }],
  마태오: [{ saint: '성 마태오 사도', date: '09-21' }],
  마르코: [{ saint: '성 마르코 복음사가', date: '04-25' }],
  루카: [{ saint: '성 루카 복음사가', date: '10-18' }],
  시몬: [{ saint: '성 시몬과 성 유다 사도', date: '10-28' }],
  유다: [{ saint: '성 시몬과 성 유다 사도', date: '10-28' }],
  타대오: [{ saint: '성 유다 타대오 사도', date: '10-28' }],
  바르톨로메오: [{ saint: '성 바르톨로메오 사도', date: '08-24' }],
  마티아: [{ saint: '성 마티아 사도', date: '05-14' }],
  바르나바: [{ saint: '성 바르나바 사도', date: '06-11' }],
  스테파노: [{ saint: '성 스테파노 첫 순교자', date: '12-26' }],
  프란치스코: [{ saint: '아시시의 성 프란치스코', date: '10-04' }, { saint: '성 프란치스코 하비에르', date: '12-03' }, { saint: '성 프란치스코 살레시오', date: '01-24' }],
  하비에르: [{ saint: '성 프란치스코 하비에르', date: '12-03' }],
  안토니오: [{ saint: '파도바의 성 안토니오', date: '06-13' }, { saint: '성 대 안토니오 아빠스', date: '01-17' }],
  아우구스티노: [{ saint: '성 아우구스티노', date: '08-28' }],
  모니카: [{ saint: '성녀 모니카', date: '08-27' }],
  베네딕토: [{ saint: '성 베네딕토 아빠스', date: '07-11' }],
  스콜라스티카: [{ saint: '성녀 스콜라스티카', date: '02-10' }],
  도미니코: [{ saint: '성 도미니코', date: '08-08' }],
  이냐시오: [{ saint: '로욜라의 성 이냐시오', date: '07-31' }, { saint: '안티오키아의 성 이냐시오', date: '10-17' }],
  알로이시오: [{ saint: '성 알로이시오 곤자가', date: '06-21' }],
  가타리나: [{ saint: '시에나의 성녀 가타리나', date: '04-29' }],
  카타리나: [{ saint: '시에나의 성녀 가타리나', date: '04-29' }],
  데레사: [{ saint: '예수의 성녀 데레사 (아빌라)', date: '10-15' }, { saint: '아기 예수의 성녀 데레사 (소화)', date: '10-01' }],
  테레사: [{ saint: '예수의 성녀 데레사 (아빌라)', date: '10-15' }, { saint: '아기 예수의 성녀 데레사 (소화)', date: '10-01' }, { saint: '콜카타의 성녀 데레사', date: '09-05' }],
  소화데레사: [{ saint: '아기 예수의 성녀 데레사 (소화)', date: '10-01' }],
  글라라: [{ saint: '성녀 글라라', date: '08-11' }],
  클라라: [{ saint: '성녀 글라라', date: '08-11' }],
  루치아: [{ saint: '성녀 루치아', date: '12-13' }],
  아녜스: [{ saint: '성녀 아녜스', date: '01-21' }],
  아가타: [{ saint: '성녀 아가타', date: '02-05' }],
  아가다: [{ saint: '성녀 아가타', date: '02-05' }],
  체칠리아: [{ saint: '성녀 체칠리아', date: '11-22' }],
  세실리아: [{ saint: '성녀 체칠리아', date: '11-22' }],
  안나: [{ saint: '성 요아킴과 성녀 안나', date: '07-26' }],
  요아킴: [{ saint: '성 요아킴과 성녀 안나', date: '07-26' }],
  엘리사벳: [{ saint: '헝가리의 성녀 엘리사벳', date: '11-17' }],
  마르타: [{ saint: '성녀 마르타', date: '07-29' }],
  니콜라오: [{ saint: '성 니콜라오', date: '12-06' }],
  바실리오: [{ saint: '성 대 바실리오', date: '01-02' }],
  그레고리오: [{ saint: '성 대 그레고리오 교황', date: '09-03' }],
  세바스티아노: [{ saint: '성 세바스티아노', date: '01-20' }],
  빈첸시오: [{ saint: '성 빈첸시오 드 폴', date: '09-27' }],
  보나벤투라: [{ saint: '성 보나벤투라', date: '07-15' }],
  라우렌시오: [{ saint: '성 라우렌시오 부제', date: '08-10' }],
  로사: [{ saint: '리마의 성녀 로사', date: '08-23' }],
  젬마: [{ saint: '성녀 젬마 갈가니', date: '04-11' }],
  헬레나: [{ saint: '성녀 헬레나', date: '08-18' }],
  비오: [{ saint: '성 비오 10세 교황', date: '08-21' }, { saint: '피에트렐치나의 성 비오 (오상의 비오)', date: '09-23' }],
  레오: [{ saint: '성 대 레오 교황', date: '11-10' }],
  마르티노: [{ saint: '투르의 성 마르티노', date: '11-11' }],
  가롤로: [{ saint: '성 가롤로 보로메오', date: '11-04' }],
  보니파시오: [{ saint: '성 보니파시오', date: '06-05' }],
  막시밀리아노: [{ saint: '성 막시밀리아노 마리아 콜베', date: '08-14' }],
  코스마: [{ saint: '성 코스마와 성 다미아노', date: '09-26' }],
  다미아노: [{ saint: '성 코스마와 성 다미아노', date: '09-26' }],
  파트리치오: [{ saint: '성 파트리치오', date: '03-17' }],
  힐데가르트: [{ saint: '빙엔의 성녀 힐데가르트', date: '09-17' }],
  제르트루다: [{ saint: '성녀 제르트루다', date: '11-16' }],
  대건: [{ saint: '성 김대건 안드레아 사제', date: '07-05' }],
  골룸바: [{ saint: '성녀 김효임 골룸바 (한국 순교자)', date: '09-20' }],
  아폴로니아: [{ saint: '성녀 아폴로니아', date: '02-09' }],
  실비아: [{ saint: '성녀 실비아', date: '11-03' }],
  율리아나: [{ saint: '성녀 율리아나', date: '02-16' }],
  크리스티나: [{ saint: '성녀 크리스티나', date: '07-24' }],
  펠릭스: [{ saint: '칸탈리체의 성 펠릭스', date: '05-18' }],
  에밀리아: [{ saint: '성녀 에밀리아', date: '05-30' }],
  루도비코: [{ saint: '성 루도비코 왕', date: '08-25' }],
  암브로시오: [{ saint: '성 암브로시오', date: '12-07' }],
  예로니모: [{ saint: '성 예로니모', date: '09-30' }],
  치릴로: [{ saint: '성 치릴로와 성 메토디오', date: '02-14' }],
  발렌티노: [{ saint: '성 발렌티노', date: '02-14' }],
};

// 입력한 이름(예: '홍길동 미카엘')에서 세례명을 찾아 대표 축일을 추천
export const suggestFeastDays = (name: string): FeastOption[] => {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  const candidates = [tokens.join(''), ...tokens.slice().reverse()];
  for (const token of candidates) {
    if (SAINT_FEASTS[token]) return SAINT_FEASTS[token];
  }
  // '홍길동미카엘' 처럼 붙여 쓴 경우: 긴 세례명부터 끝부분 일치 확인
  const joined = tokens.join('');
  const key = Object.keys(SAINT_FEASTS).sort((a, b) => b.length - a.length).find(k => joined.endsWith(k));
  return key ? SAINT_FEASTS[key] : [];
};
