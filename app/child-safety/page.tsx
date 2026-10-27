import type { Metadata } from 'next';
import LegalPage from '@/components/legal/LegalPage';
import { ADMIN_EMAILS } from '@/lib/admin';

export const metadata: Metadata = { title: '아동 안전 표준 - 가톨릭그램' };

// 구글 플레이 '아동 안전 표준' 정책: 아동 성적 학대·착취(CSAE)를 금지하는 공개 기준 (Play Console 앱 콘텐츠 → 아동 안전 표준에 이 주소를 적는다)
export default function ChildSafetyPage() {
  const contact = ADMIN_EMAILS[0];
  const mail = <a className="text-blue-600 underline" href={`mailto:${contact}`}>{contact}</a>;
  return (
    <LegalPage title="아동 안전 표준" updated="2026년 10월 27일">
      <p>가톨릭그램(Catholicgram)은 아동 성적 학대 및 착취(CSAE, Child Sexual Abuse and Exploitation)를 절대 허용하지 않습니다. 이 기준은 가톨릭그램 앱과 웹사이트의 모든 기능(게시글·사진·영상·댓글·스토리·1:1 메시지·단체 채팅방·모두의 사랑방·익명 고민상담·프로필)에 적용됩니다.</p>

      <section>
        <h2>1. 금지되는 콘텐츠와 행동</h2>
        <p>아래 콘텐츠와 행동은 어떠한 경우에도 허용되지 않으며, 발견 즉시 삭제하고 계정을 영구 정지합니다.</p>
        <ul>
          <li>아동 성적 학대 콘텐츠(CSAM): 미성년자가 등장하는 성적인 사진·영상·그림·글 (합성·가상으로 만든 것 포함)</li>
          <li>미성년자를 성적으로 묘사하거나 성적 대상으로 삼는 모든 콘텐츠</li>
          <li>그루밍: 성적 목적으로 미성년자에게 접근해 신뢰를 쌓거나 만남을 유도하는 행위</li>
          <li>미성년자에게 성적인 사진·영상을 요구하거나, 이를 빌미로 협박하는 행위(성착취·몸캠 협박)</li>
          <li>아동 인신매매, 아동 성매매를 홍보하거나 알선하는 행위</li>
          <li>위와 같은 콘텐츠를 찾거나 나누는 방법을 안내하는 행위</li>
        </ul>
      </section>

      <section>
        <h2>2. 이용 연령</h2>
        <p>만 14세 미만은 가입할 수 없습니다. 만 14세 미만으로 확인된 계정은 이용을 제한합니다.</p>
      </section>

      <section>
        <h2>3. 앱 안에서 신고하기</h2>
        <ul>
          <li>게시글·댓글·단체 채팅방과 사랑방 대화·익명 고민글과 답글·사용자 프로필마다 있는 <b>🚨 신고</b> 버튼으로 앱을 벗어나지 않고 바로 운영자에게 알릴 수 있습니다. 1:1 메시지는 상대방 이름이나 사진을 눌러 열리는 프로필에서 신고합니다. 신고 사유는 <b>&lsquo;음란물 · 성적인 내용&rsquo;</b>을 고르고, 미성년자와 관련된 내용이면 자세한 내용 칸에 함께 적어 주세요.</li>
          <li>신고하면 운영자에게 즉시 알림이 가며, 처리 결과는 내 공간 → 건의하기 → 내 신고에서 볼 수 있습니다.</li>
          <li>문제가 되는 사용자는 <b>🚫 차단</b>해 메시지와 글을 받지 않을 수 있습니다.</li>
          <li>앱을 쓸 수 없는 경우 이메일({mail})로도 신고할 수 있습니다.</li>
        </ul>
      </section>

      <section>
        <h2>4. 운영자의 조치</h2>
        <ul>
          <li>아동 안전과 관련된 신고는 가장 먼저, 24시간 이내에 확인합니다.</li>
          <li>아동 성적 학대 콘텐츠(CSAM)나 아동 성착취를 확인하면 해당 콘텐츠를 즉시 삭제하고, 관련 계정을 영구 정지합니다.</li>
          <li>「아동·청소년의 성보호에 관한 법률」 등 관련 법령에 따라 <b>경찰청</b>(사이버범죄 신고 ecrm.police.go.kr, ☎ 182)과 <b>방송통신심의위원회</b>(☎ 1377) 등 관계 기관에 신고하고 수사에 협조합니다. 필요한 경우 미국 실종·착취아동센터(NCMEC) 등 해외 기관에도 신고합니다.</li>
        </ul>
      </section>

      <section>
        <h2>5. 아동 안전 담당자</h2>
        <p>아동 안전과 아동 성적 학대·착취 방지에 관한 문의와 신고는 아래 담당자가 직접 받습니다.</p>
        <ul>
          <li>담당: 가톨릭그램 운영자</li>
          <li>이메일: {mail}</li>
        </ul>
        <p className="mt-2">아이가 위험에 처해 있다면 지금 바로 <b>112</b>에 신고하세요.</p>
      </section>

      <section lang="en">
        <h2>Child Safety Standards (English)</h2>
        <ul>
          <li>Catholicgram has zero tolerance for child sexual abuse and exploitation (CSAE) and child sexual abuse material (CSAM). This applies to every part of the app: posts, photos, videos, comments, stories, direct messages, the group chat, the anonymous board and profiles.</li>
          <li>Users must be at least 14 years old to sign up.</li>
          <li>Users can report any post, comment, group chat message, anonymous post or reply, or user profile (including direct message partners) with the in-app <b>Report</b> button without leaving the app, and can block other users. Reports can also be sent by email to {mail}.</li>
          <li>Child safety reports are reviewed within 24 hours. When we become aware of CSAM or child sexual exploitation, we remove the content immediately, permanently ban the accounts involved, and report it to the relevant authorities, including the Korean National Police Agency and the Korea Communications Standards Commission, and to NCMEC where appropriate, in compliance with applicable child safety laws.</li>
          <li>Child safety point of contact: Catholicgram operator, {mail}</li>
        </ul>
      </section>
    </LegalPage>
  );
}
