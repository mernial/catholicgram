import type { Metadata } from 'next';
import LegalPage from '@/components/legal/LegalPage';
import { ADMIN_EMAILS } from '@/lib/admin';

export const metadata: Metadata = { title: '이용약관 및 커뮤니티 규칙 - 가톨릭그램' };

export default function TermsPage() {
  const contact = ADMIN_EMAILS[0];
  return (
    <LegalPage title="이용약관 및 커뮤니티 규칙" updated="2026년 10월 5일">
      <p>가톨릭그램은 기도와 묵상, 신앙의 기쁨과 고민을 나누는 가톨릭 신자 커뮤니티입니다. 서비스를 이용하면 아래 약관과 커뮤니티 규칙에 동의한 것으로 봅니다.</p>

      <section>
        <h2>1. 이용 자격</h2>
        <ul>
          <li>만 14세 이상이면 카카오 계정으로 가입할 수 있습니다.</li>
          <li>다른 사람을 사칭하거나 성직자·수도자를 사칭해서는 안 됩니다. 인증 뱃지는 운영자가 확인 후 부여합니다.</li>
        </ul>
      </section>

      <section>
        <h2>2. 금지되는 콘텐츠와 행동</h2>
        <p>아래 콘텐츠는 허용되지 않으며, 발견 즉시 삭제되고 계정이 제한될 수 있습니다. 이러한 콘텐츠에는 어떠한 관용도 없습니다.</p>
        <ul>
          <li>욕설, 비방, 괴롭힘, 따돌림, 위협</li>
          <li>음란물, 성적인 콘텐츠, 아동·청소년을 대상으로 한 모든 부적절한 콘텐츠</li>
          <li>혐오 표현, 특정 종교·집단에 대한 차별과 모욕</li>
          <li>스팸, 광고, 사기, 다단계 권유</li>
          <li>다른 사람의 개인정보(연락처, 주소 등) 무단 공개</li>
          <li>폭력·자해를 조장하는 내용, 불법 행위</li>
          <li>저작권 등 타인의 권리를 침해하는 콘텐츠</li>
        </ul>
      </section>

      <section>
        <h2>3. 신고와 차단</h2>
        <ul>
          <li>부적절한 게시글·댓글·메시지·익명글이나 사용자를 발견하면 각 항목의 <b>🚨 신고</b> 버튼으로 운영자에게 알릴 수 있습니다.</li>
          <li>특정 사용자를 <b>🚫 차단</b>하면 그 사람의 글과 댓글이 보이지 않고, 메시지와 팔로우 요청을 받지 않습니다. 차단은 내 공간 → ⚙️ 설정 → 차단 목록에서 풀 수 있습니다.</li>
          <li>운영자는 신고를 24시간 이내에 확인하고, 규칙 위반 시 콘텐츠를 삭제하며 위반한 사용자의 이용을 제한합니다.</li>
        </ul>
      </section>

      <section>
        <h2>4. 익명 고민상담</h2>
        <ul>
          <li>익명 게시판에서도 위 규칙이 똑같이 적용됩니다. 익명이라는 이유로 다른 사람에게 상처를 주어서는 안 됩니다.</li>
          <li>생명이 위급하거나 극단적 선택이 걱정되는 경우 즉시 <b>자살예방상담전화 109</b>, <b>정신건강위기상담 1577-0199</b>, 또는 <b>112 / 119</b>에 연락하세요.</li>
        </ul>
      </section>

      <section>
        <h2>5. 게시물의 권리와 책임</h2>
        <ul>
          <li>게시물의 권리와 책임은 작성자에게 있습니다. 서비스는 게시물을 서비스 화면에 표시하는 데에만 이용합니다.</li>
          <li>운영자는 규칙을 위반한 게시물을 사전 통지 없이 삭제할 수 있습니다.</li>
        </ul>
      </section>

      <section>
        <h2>6. 탈퇴</h2>
        <p>언제든지 내 공간 → ⚙️ 설정 → 회원 탈퇴에서 탈퇴할 수 있으며, 탈퇴 시 작성한 모든 데이터가 삭제됩니다. 자세한 내용은 <a className="text-blue-600 underline" href="/privacy">개인정보처리방침</a>을 확인하세요.</p>
      </section>

      <section>
        <h2>7. 문의</h2>
        <p>이메일 <a className="text-blue-600 underline" href={`mailto:${contact}`}>{contact}</a> 또는 앱의 내 공간 → 📮 건의하기</p>
      </section>
    </LegalPage>
  );
}
