'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { deleteMyAccount } from '@/lib/account';
import { ADMIN_EMAILS } from '@/lib/admin';
import LegalPage from '@/components/legal/LegalPage';

// 구글 플레이 "계정 삭제 요청 URL" 로 등록하는 페이지
export default function AccountDeletionPage() {
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { setUser(data.user); setChecked(true); });
  }, []);

  const handleDelete = async () => {
    if (!window.confirm('정말 탈퇴하시겠습니까?\n작성한 게시글, 사진, 댓글, 메시지 등 모든 데이터가 삭제되며 되돌릴 수 없습니다.')) return;
    setDeleting(true);
    const result = await deleteMyAccount();
    setDeleting(false);
    if (result.ok) { setDone(true); setUser(null); }
    else alert(result.message);
  };

  return (
    <LegalPage title="가톨릭그램 계정 삭제" updated="2026년 10월 5일">
      <section>
        <h2>삭제되는 데이터</h2>
        <p>계정을 삭제하면 아래 데이터가 <b>즉시 영구 삭제</b>되며 되돌릴 수 없습니다.</p>
        <ul>
          <li>프로필(이름·세례명, 핸들, 프로필 사진)과 로그인 정보</li>
          <li>작성한 게시글과 사진, 댓글, 기도/공감 표시</li>
          <li>주고받은 1:1 메시지, 팔로우 관계</li>
          <li>익명 고민글과 답글, 건의사항, 신고·차단 내역, 알림 설정</li>
        </ul>
        <p className="mt-2 text-xs text-stone-500">별도로 보관하는 데이터는 없습니다. (법령상 보관 의무가 있는 경우 제외)</p>
      </section>

      <section>
        <h2>삭제 방법</h2>
        <ul>
          <li><b>앱에서:</b> 내 공간 → ⚙️ 설정 → 회원 탈퇴</li>
          <li><b>이 페이지에서:</b> 로그인한 상태라면 아래 버튼으로 바로 삭제할 수 있습니다.</li>
          <li><b>이메일로:</b> 로그인이 어렵다면 <a className="text-blue-600 underline" href={`mailto:${ADMIN_EMAILS[0]}?subject=${encodeURIComponent('가톨릭그램 계정 삭제 요청')}`}>{ADMIN_EMAILS[0]}</a> 로 핸들(@아이디)과 함께 요청해주세요. 7일 이내에 처리합니다.</li>
        </ul>
      </section>

      <section className="border border-red-200 bg-red-50 rounded-2xl p-4">
        {done ? (
          <p className="text-sm font-bold text-stone-800">계정과 모든 데이터가 삭제되었습니다. 그동안 함께해주셔서 감사합니다. 🙏</p>
        ) : !checked ? (
          <p className="text-sm text-stone-500">로그인 상태를 확인하는 중...</p>
        ) : user ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-stone-700">현재 로그인한 계정을 삭제합니다.</p>
            <button onClick={handleDelete} disabled={deleting} className="w-full bg-red-600 text-white py-3 rounded-xl text-sm font-bold disabled:opacity-50">
              {deleting ? '삭제하는 중...' : '계정 영구 삭제'}
            </button>
          </div>
        ) : (
          <p className="text-sm text-stone-700">
            로그인되어 있지 않습니다. <Link href="/" className="text-blue-600 underline">가톨릭그램</Link>에서 로그인한 뒤 이 페이지로 다시 오시거나, 위 이메일로 요청해주세요.
          </p>
        )}
      </section>
    </LegalPage>
  );
}
