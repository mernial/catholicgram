import type { Metadata } from 'next';
import LegalPage from '@/components/legal/LegalPage';
import { ADMIN_EMAILS } from '@/lib/admin';

export const metadata: Metadata = { title: '개인정보처리방침 - 가톨릭그램' };

export default function PrivacyPage() {
  const contact = ADMIN_EMAILS[0];
  return (
    <LegalPage title="개인정보처리방침" updated="2026년 10월 5일">
      <p>가톨릭그램(이하 &ldquo;서비스&rdquo;)은 이용자의 개인정보를 소중히 여기며, 「개인정보 보호법」 등 관련 법령을 준수합니다. 이 방침은 서비스가 어떤 정보를 어떻게 수집·이용·보관·파기하는지 안내합니다.</p>

      <section>
        <h2>1. 수집하는 개인정보 항목</h2>
        <table>
          <thead><tr><th>구분</th><th>항목</th></tr></thead>
          <tbody>
            <tr><td>카카오 로그인</td><td>카카오 계정 식별자, 이메일(동의한 경우), 닉네임</td></tr>
            <tr><td>프로필</td><td>이름(세례명), 고유 핸들(@아이디), 프로필 사진</td></tr>
            <tr><td>서비스 이용</td><td>게시글·사진·댓글, 기도/공감 표시, 팔로우 관계, 1:1 메시지와 읽음 여부, 익명 고민글·답글, 건의사항, 신고·차단 내역</td></tr>
            <tr><td>알림</td><td>푸시 알림 수신을 허용한 경우 기기별 알림 구독 정보</td></tr>
            <tr><td>자동 수집</td><td>접속 기록, 브라우저/기기 정보 (호스팅 서비스의 보안·장애 대응 목적)</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>2. 이용 목적</h2>
        <ul>
          <li>회원 식별 및 로그인, 프로필 표시</li>
          <li>게시글·댓글·메시지·익명 고민상담 등 커뮤니티 기능 제공</li>
          <li>댓글·메시지·팔로우 요청 알림 발송</li>
          <li>부적절한 콘텐츠 신고 처리, 서비스 운영 및 건의사항 응대</li>
        </ul>
      </section>

      <section>
        <h2>3. 익명 고민상담</h2>
        <p>익명 고민상담 게시판의 글과 답글은 다른 이용자에게 무작위 익명 코드로만 표시됩니다. 작성자 정보는 삭제 권한 확인과 악용 방지를 위해 시스템 내부에만 저장되며 다른 이용자에게 공개되지 않습니다. 작성자가 정한 기간이 지나면 글과 답글은 자동으로 삭제됩니다.</p>
      </section>

      <section>
        <h2>4. 보관 및 파기</h2>
        <ul>
          <li>개인정보는 회원 탈퇴 시 지체 없이 파기합니다. 탈퇴하면 작성한 게시글, 사진, 댓글, 메시지, 팔로우, 익명글, 건의사항 등이 함께 삭제됩니다.</li>
          <li>이용자가 직접 삭제한 게시물과 기간이 지난 익명글은 즉시 또는 자동으로 삭제됩니다.</li>
          <li>법령에 따라 보관이 필요한 경우 해당 기간 동안만 보관합니다.</li>
        </ul>
      </section>

      <section>
        <h2>5. 개인정보 처리 위탁 및 국외 이전</h2>
        <p>서비스 제공을 위해 아래 업체에 처리를 위탁하며, 데이터는 해당 업체의 해외 서버에 저장될 수 있습니다.</p>
        <table>
          <thead><tr><th>업체</th><th>위탁 업무</th></tr></thead>
          <tbody>
            <tr><td>Supabase Inc.</td><td>회원 인증, 데이터베이스 및 사진 저장</td></tr>
            <tr><td>Vercel Inc.</td><td>웹사이트 호스팅</td></tr>
            <tr><td>Kakao Corp.</td><td>카카오 로그인</td></tr>
            <tr><td>Google LLC, Apple Inc., Mozilla 등</td><td>푸시 알림 전달 (기기 브라우저에 따라)</td></tr>
          </tbody>
        </table>
        <p className="mt-2">서비스는 이용자의 개인정보를 판매하거나 광고 목적으로 제3자에게 제공하지 않습니다.</p>
      </section>

      <section>
        <h2>6. 이용자의 권리</h2>
        <ul>
          <li>언제든지 자신의 프로필과 게시물을 확인·수정·삭제할 수 있습니다.</li>
          <li>앱의 <b>내 공간 → ⚙️ 설정 → 회원 탈퇴</b> 또는 <a className="text-blue-600 underline" href="/account-deletion">계정 삭제 안내 페이지</a>에서 탈퇴할 수 있습니다.</li>
          <li>푸시 알림은 앱의 알림 화면 또는 기기 설정에서 언제든 끌 수 있습니다.</li>
        </ul>
      </section>

      <section>
        <h2>7. 만 14세 미만 아동</h2>
        <p>서비스는 만 14세 미만 아동의 회원가입을 받지 않습니다.</p>
      </section>

      <section>
        <h2>8. 개인정보 보호책임자 및 문의</h2>
        <p>개인정보 관련 문의, 열람·정정·삭제 요청은 아래로 연락해주시면 지체 없이 처리하겠습니다.</p>
        <ul>
          <li>담당: 가톨릭그램 운영자</li>
          <li>이메일: <a className="text-blue-600 underline" href={`mailto:${contact}`}>{contact}</a></li>
          <li>앱 내: 내 공간 → 📮 건의하기</li>
        </ul>
      </section>

      <section>
        <h2>9. 방침의 변경</h2>
        <p>이 방침이 바뀌는 경우 시행 7일 전부터 서비스 공지 또는 이 페이지를 통해 알립니다.</p>
      </section>
    </LegalPage>
  );
}
