'use client';

import { useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import Icon from '@/components/Icon';

// 운영자 건의함 (supabase/feedback.sql)
// 일반 교우: 건의 보내기 + 내가 보낸 건의의 상태/답변 보기
// 관리자: 받은 건의 전체 보기, 상태 변경, 답변

interface Feedback {
  id: string;
  user_id: string;
  author_name: string | null;
  author_handle: string | null;
  category: 'suggestion' | 'bug' | 'other';
  content: string;
  status: 'received' | 'reviewing' | 'done';
  admin_reply: string | null;
  replied_at: string | null;
  created_at: string;
}

const CATEGORIES: { key: Feedback['category']; label: string }[] = [
  { key: 'suggestion', label: '건의' },
  { key: 'bug', label: '오류 신고' },
  { key: 'other', label: '기타' },
];

const STATUS: Record<Feedback['status'], { label: string; className: string }> = {
  received: { label: '접수', className: 'bg-stone-100 text-stone-600 border-stone-200' },
  reviewing: { label: '확인 중', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  done: { label: '완료', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

const categoryLabel = (c: Feedback['category']) => CATEGORIES.find(x => x.key === c)?.label || c;

// 신고 (supabase/report-block.sql) — 관리자만 볼 수 있음
interface Report {
  id: string;
  target_type: 'post' | 'comment' | 'anon_post' | 'anon_reply' | 'user' | 'message';
  target_id: string;
  target_user_id: string | null;
  target_preview: string | null;
  reason: string;
  detail: string | null;
  status: 'open' | 'resolved' | 'dismissed';
  created_at: string;
  admin_reply?: string | null;
  replied_at?: string | null;
}
// 관리자가 신고한 분께 보내는 처리 답변 (눌러서 바로 쓰고 고칠 수 있음)
const REPORT_REPLY_PRESETS = [
  '신고해 주셔서 감사합니다. 확인 후 해당 내용을 삭제했습니다.',
  '신고해 주셔서 감사합니다. 작성자에게 주의를 주고 지켜보겠습니다.',
  '검토해 보니 운영 규칙에 어긋나지 않아 그대로 두었습니다. 관심 가져 주셔서 감사합니다.',
];
const REPORT_TYPE: Record<Report['target_type'], string> = {
  post: '게시글', comment: '댓글', anon_post: '익명 고민글', anon_reply: '익명 답글', user: '사용자', message: '메시지',
};
const REPORT_REASON: Record<string, string> = {
  spam: '스팸·광고', abuse: '욕설·괴롭힘', sexual: '음란·성적', hate: '혐오·차별', privacy: '개인정보 노출', other: '기타',
};
const REPORT_STATUS: Record<Report['status'], { label: string; className: string }> = {
  open: { label: '미처리', className: 'bg-red-50 text-red-700 border-red-200' },
  resolved: { label: '조치 완료', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  dismissed: { label: '신고 해제', className: 'bg-stone-100 text-stone-500 border-stone-200' },
};

export default function FeedbackModal({ user, isAdmin, initialView, onClose, sendPush }: {
  user: User;
  isAdmin: boolean;
  initialView?: 'reports' | 'inbox' | 'mine' | null; // 알림으로 열었을 때 바로 보여 줄 목록
  onClose: () => void;
  sendPush: (type: 'feedback' | 'feedback_reply' | 'report_reply', id: string) => void;
}) {
  // 'reports': 관리자는 받은 신고 전체, 일반 회원은 내가 한 신고와 처리 결과
  const [view, setView] = useState<'write' | 'mine' | 'inbox' | 'answered' | 'reports'>(initialView || (isAdmin ? 'inbox' : 'write'));
  const [reportReplyDrafts, setReportReplyDrafts] = useState<{ [id: string]: string }>({});
  const [reports, setReports] = useState<Report[]>([]);
  const [category, setCategory] = useState<Feedback['category']>('suggestion');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [items, setItems] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(false);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [replyDrafts, setReplyDrafts] = useState<{ [id: string]: string }>({});
  const [openAnsweredId, setOpenAnsweredId] = useState<string | null>(null); // 답변한 건의: 눌러서 펼친 것

  const fetchItems = async (mode: 'mine' | 'inbox') => {
    setLoading(true);
    let query = supabase.from('feedback').select('*').order('created_at', { ascending: false }).limit(200);
    if (mode === 'mine') query = query.eq('user_id', user.id);
    const { data, error } = await query;
    setLoading(false);
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message)) setSetupNeeded(true);
      return;
    }
    setItems((data || []) as Feedback[]);
  };

  const fetchReports = async () => {
    setLoading(true);
    let query = supabase.from('reports').select('*').order('created_at', { ascending: false }).limit(200);
    if (!isAdmin) query = query.eq('reporter_id', user.id);
    const { data, error } = await query;
    setLoading(false);
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) setSetupNeeded(true);
      return;
    }
    setReports((data || []) as Report[]);
  };

  const setReportStatus = async (report: Report, status: Report['status']) => {
    const { error } = await supabase.from('reports').update({ status }).eq('id', report.id);
    if (error) { alert(`변경하지 못했습니다.\n(${error.message})`); return; }
    setReports(prev => prev.map(r => r.id === report.id ? { ...r, status } : r));
  };

  // 신고한 분께 처리 결과 답변 보내기 (휴대폰 알림도 감)
  const sendReportReply = async (report: Report) => {
    const reply = (reportReplyDrafts[report.id] || '').trim();
    if (!reply) return;
    const replied_at = new Date().toISOString();
    const { error } = await supabase.from('reports').update({ admin_reply: reply, replied_at, ...(report.status === 'open' ? { status: 'resolved' } : {}) }).eq('id', report.id);
    if (error) {
      alert(/admin_reply|column/i.test(error.message) ? '답변 기능 준비 중이에요. (supabase/report-reply.sql 실행 필요)' : `보내지 못했습니다.\n(${error.message})`);
      return;
    }
    setReports(prev => prev.map(r => r.id === report.id ? { ...r, admin_reply: reply, replied_at, status: r.status === 'open' ? 'resolved' : r.status } : r));
    setReportReplyDrafts(prev => ({ ...prev, [report.id]: '' }));
    sendPush('report_reply', report.id);
  };

  // 신고된 콘텐츠 삭제 후 '조치 완료'로 표시
  const deleteReportedContent = async (report: Report) => {
    if (!window.confirm('신고된 콘텐츠를 삭제할까요?')) return;
    const { error } =
      report.target_type === 'post' ? await supabase.from('posts').delete().eq('id', report.target_id)
      : report.target_type === 'comment' ? await supabase.from('comments').delete().eq('id', report.target_id)
      : report.target_type === 'anon_post' ? await supabase.rpc('delete_anon_post', { p_id: report.target_id })
      : report.target_type === 'anon_reply' ? await supabase.rpc('delete_anon_reply', { p_id: report.target_id })
      : { error: { message: '이 유형은 직접 삭제할 수 없습니다.' } };
    if (error) { alert(`삭제하지 못했습니다.\n(${error.message})`); return; }
    setReportStatus(report, 'resolved');
  };

  useEffect(() => {
    if (view === 'reports') fetchReports();
    else if (view !== 'write') fetchItems(view === 'answered' ? 'inbox' : view);
  }, [view]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = content.trim();
    if (!text) return;
    setSending(true);
    const { data, error } = await supabase.from('feedback').insert({ category, content: text }).select('id').single();
    setSending(false);
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) setSetupNeeded(true);
      else alert(`보내지 못했습니다.\n(${error.message})`);
      return;
    }
    if (data) sendPush('feedback', data.id);
    setContent('');
    alert('건의사항이 운영자에게 전달되었습니다. 감사합니다 🙏');
    setView('mine');
  };

  const updateStatus = async (item: Feedback, status: Feedback['status']) => {
    const { error } = await supabase.from('feedback').update({ status }).eq('id', item.id);
    if (error) { alert(`변경하지 못했습니다.\n(${error.message})`); return; }
    setItems(prev => prev.map(f => f.id === item.id ? { ...f, status } : f));
  };

  const sendReply = async (item: Feedback) => {
    const reply = (replyDrafts[item.id] ?? item.admin_reply ?? '').trim();
    if (!reply) return;
    const replied_at = new Date().toISOString();
    const status = item.status === 'received' ? 'reviewing' : item.status;
    const { error } = await supabase.from('feedback').update({ admin_reply: reply, replied_at, status }).eq('id', item.id);
    if (error) { alert(`답변을 저장하지 못했습니다.\n(${error.message})`); return; }
    setItems(prev => prev.map(f => f.id === item.id ? { ...f, admin_reply: reply, replied_at, status } : f));
    setReplyDrafts(prev => { const next = { ...prev }; delete next[item.id]; return next; });
    sendPush('feedback_reply', item.id);
    if (!item.admin_reply) alert('답변을 보냈어요. ✅ 답변한 건의 목록으로 옮겨졌어요.');
  };

  const deleteItem = async (item: Feedback) => {
    if (!window.confirm('이 건의를 삭제하시겠습니까?')) return;
    const { error } = await supabase.from('feedback').delete().eq('id', item.id);
    if (error) { alert(`삭제하지 못했습니다.\n(${error.message})`); return; }
    setItems(prev => prev.filter(f => f.id !== item.id));
  };

  // 관리자: 답변 전 건의는 '받은 건의함', 답변한 건의는 '답변한 건의'에 따로 모아 보기
  const isAdminList = view === 'inbox' || view === 'answered';
  const shownItems = view === 'inbox'
    ? items.filter(f => !f.admin_reply)
    : view === 'answered'
      ? items.filter(f => !!f.admin_reply).sort((a, b) => (b.replied_at || '').localeCompare(a.replied_at || ''))
      : items;
  const pendingCount = items.filter(f => !f.admin_reply).length;

  // 관리자(운영자)에게는 '건의하기'·'내 건의'가 필요 없으므로 받은 건의·답변·신고만
  const tabs: { key: typeof view; label: string }[] = [
    ...(!isAdmin ? [{ key: 'write' as const, label: '건의하기' }, { key: 'mine' as const, label: '내 건의' }, { key: 'reports' as const, label: '내 신고' }] : []),
    ...(isAdmin ? [
      { key: 'inbox' as const, label: `받은 건의함${pendingCount ? ` (${pendingCount})` : ''}` },
      { key: 'answered' as const, label: '답변한 건의' },
      { key: 'reports' as const, label: '신고' },
    ] : []),
  ];

  return (
    <div className="fixed inset-0 bg-black/60 z-[85] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:w-[28rem] h-[94dvh] sm:h-[90dvh] rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col pb-safe" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-stone-100 flex items-center justify-between shrink-0">
          <h2 className="font-bold text-stone-900"><Icon name="envelope" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />{isAdmin ? '건의함 · 신고 관리' : '운영자에게 건의하기'}</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 font-bold text-lg px-1">×</button>
        </div>
        <div className="shrink-0 flex gap-1 px-4 pt-3 pb-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setView(t.key)} className={`shrink-0 whitespace-nowrap text-xs px-3 py-1.5 rounded-full border ${view === t.key ? 'bg-stone-900 text-white border-stone-900 font-bold' : 'bg-white text-stone-600 border-stone-200'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {setupNeeded ? (
          <div className="p-10 text-center text-sm text-stone-500 leading-relaxed">
            건의함 준비 중입니다.<br />
            <span className="text-xs">(관리자: Supabase에서 <code>supabase/feedback.sql</code> 을 실행해주세요)</span>
          </div>
        ) : view === 'reports' ? (
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain divide-y divide-stone-100 mt-2">
            {!loading && reports.length === 0 && <div className="p-10 text-center text-stone-400 text-sm">{isAdmin ? '접수된 신고가 없습니다.' : '내가 한 신고가 없어요.'}</div>}
            {!isAdmin && reports.map(r => (
              <div key={r.id} className="p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 text-[0.8125rem]">
                  <span className="font-bold text-stone-700">{REPORT_TYPE[r.target_type]} · {REPORT_REASON[r.reason] || r.reason}</span>
                  <span className={`px-2 py-0.5 rounded-full border font-bold ${REPORT_STATUS[r.status].className}`}>{r.status === 'open' ? '확인 중' : '처리됨'}</span>
                </div>
                {r.target_preview && <p className="text-sm text-stone-600 bg-stone-50 rounded-lg p-2.5 whitespace-pre-wrap line-clamp-2">{r.target_preview}</p>}
                <p className="text-[0.8125rem] text-stone-400">{new Date(r.created_at).toLocaleString('ko-KR')} 신고</p>
                {r.admin_reply ? (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                    <p className="text-xs font-bold text-blue-800 mb-1"><Icon name="crown" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />운영자 답변</p>
                    <p className="text-sm text-stone-800 whitespace-pre-wrap leading-relaxed">{r.admin_reply}</p>
                  </div>
                ) : r.status === 'open' && <p className="text-xs text-stone-500">운영자가 확인하고 있어요. 처리되면 알림으로 알려드려요.</p>}
              </div>
            ))}
            {isAdmin && reports.map(r => (
              <div key={r.id} className="p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 text-[0.8125rem]">
                  <span className="font-bold text-stone-700">{REPORT_TYPE[r.target_type]} · {REPORT_REASON[r.reason] || r.reason}</span>
                  <span className={`px-2 py-0.5 rounded-full border font-bold ${REPORT_STATUS[r.status].className}`}>{REPORT_STATUS[r.status].label}</span>
                </div>
                {r.target_preview && <p className="text-[0.9375rem] text-stone-800 bg-stone-50 rounded-lg p-2.5 whitespace-pre-wrap line-clamp-4">{r.target_preview}</p>}
                {r.detail && <p className="text-xs text-stone-600">신고 내용: {r.detail}</p>}
                <p className="text-[0.8125rem] text-stone-400">{new Date(r.created_at).toLocaleString('ko-KR')}</p>
                <div className="flex gap-1.5 flex-wrap">
                  {['post', 'comment', 'anon_post', 'anon_reply'].includes(r.target_type) && r.status === 'open' && (
                    <button onClick={() => deleteReportedContent(r)} className="text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white font-bold">콘텐츠 삭제</button>
                  )}
                  {r.status !== 'resolved' && <button onClick={() => setReportStatus(r, 'resolved')} className="text-xs px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700">조치 완료</button>}
                  {r.status !== 'dismissed' && <button onClick={() => { if (window.confirm('문제없는 내용으로 보고 신고를 해제할까요?\n(글은 그대로 두고, 신고 표시만 없어져요)')) setReportStatus(r, 'dismissed'); }} className="text-xs px-3 py-1.5 rounded-lg border border-blue-300 text-blue-700 font-bold"><Icon name="check" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />신고 해제</button>}
                  {r.status !== 'open' && <button onClick={() => setReportStatus(r, 'open')} className="text-xs px-3 py-1.5 rounded-lg border border-stone-300 text-stone-500">다시 미처리로</button>}
                </div>
                {/* 신고한 분께 처리 결과 알려주기 */}
                {r.admin_reply ? (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-2.5 text-[0.8125rem] text-stone-700">
                    <b className="text-blue-800">보낸 답변</b> · {r.replied_at && new Date(r.replied_at).toLocaleString('ko-KR')}<br />{r.admin_reply}
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5 bg-stone-50 rounded-xl p-2.5">
                    <p className="text-xs font-bold text-stone-600">신고한 분께 처리 결과 알려주기</p>
                    <div className="flex flex-wrap gap-1">
                      {REPORT_REPLY_PRESETS.map(t => (
                        <button key={t} onClick={() => setReportReplyDrafts(prev => ({ ...prev, [r.id]: t }))} className="text-[0.75rem] text-left px-2 py-1 rounded-lg bg-white border border-stone-200 text-stone-600">{t.replace('신고해 주셔서 감사합니다. ', '').slice(0, 22)}…</button>
                      ))}
                    </div>
                    <textarea value={reportReplyDrafts[r.id] || ''} onChange={e => setReportReplyDrafts(prev => ({ ...prev, [r.id]: e.target.value }))} rows={2} maxLength={500} placeholder="처리 결과를 적어주세요" className="w-full p-2.5 text-sm bg-white border border-stone-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-300" />
                    <button onClick={() => sendReportReply(r)} disabled={!(reportReplyDrafts[r.id] || '').trim()} className="self-end text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white font-bold disabled:opacity-40"><Icon name="send" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />답변 보내기</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : view === 'write' ? (
          <form onSubmit={handleSend} className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3">
            <p className="text-xs text-stone-500 leading-relaxed">
              가톨릭그램을 더 좋게 만들 의견이나 불편한 점을 알려주세요.<br />운영자가 확인 후 답변드립니다.
            </p>
            <div className="flex gap-1.5">
              {CATEGORIES.map(c => (
                <button type="button" key={c.key} onClick={() => setCategory(c.key)} className={`text-xs px-3 py-1.5 rounded-full border ${category === c.key ? 'bg-blue-500 text-white border-blue-500 font-bold' : 'bg-white text-stone-600 border-stone-200'}`}>
                  {c.label}
                </button>
              ))}
            </div>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={6}
              maxLength={2000}
              placeholder={category === 'bug' ? '어떤 화면에서 무엇을 했을 때 문제가 생겼는지 적어주세요. (휴대폰 종류도 알려주시면 좋아요)' : '자유롭게 적어주세요...'}
              className="w-full p-3.5 text-sm bg-stone-50/70 border border-stone-200 rounded-2xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <button type="submit" disabled={sending || !content.trim()} className="w-full bg-stone-900 text-white py-3 rounded-xl text-sm font-bold disabled:opacity-40">
              {sending ? '보내는 중...' : '운영자에게 보내기'}
            </button>
          </form>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain divide-y divide-stone-100 mt-2">
            {loading && items.length === 0 && <div className="p-10 text-center text-stone-400 text-sm">불러오는 중...</div>}
            {!loading && shownItems.length === 0 && (
              <div className="p-10 text-center text-stone-400 text-sm">
                {view === 'inbox' ? '답변을 기다리는 건의가 없습니다.' : view === 'answered' ? '아직 답변한 건의가 없습니다.' : '아직 보낸 건의가 없습니다.'}
              </div>
            )}
            {shownItems.map(item => view === 'answered' && openAnsweredId !== item.id ? (
              // 답변한 건의: 아이디 + 건의 내용 한 줄 (누르면 펼쳐서 답변 보기·수정)
              <button key={item.id} onClick={() => setOpenAnsweredId(item.id)} className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-stone-50">
                <span className="flex-1 min-w-0">
                  <span className="flex items-baseline gap-1.5 min-w-0">
                    <b className="text-sm text-stone-900 truncate">{item.author_name || '교우'}</b>
                    {item.author_handle && <span className="text-xs text-stone-400 truncate">@{item.author_handle}</span>}
                  </span>
                  <span className="block text-sm text-stone-600 truncate mt-0.5">{item.content}</span>
                </span>
                <span className="text-stone-300 shrink-0">›</span>
              </button>
            ) : (
              <div key={item.id} className="p-4 flex flex-col gap-2">
                {view === 'answered' && (
                  <button onClick={() => setOpenAnsweredId(null)} className="self-start text-xs text-stone-400">▲ 접기</button>
                )}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0 text-[0.8125rem]">
                    <span className="font-bold text-stone-700">{categoryLabel(item.category)}</span>
                    {isAdminList && <span className="text-stone-500 truncate">· {item.author_name || '교우'}{item.author_handle && ` @${item.author_handle}`}</span>}
                    <span className="text-stone-400 shrink-0">· {new Date(item.created_at).toLocaleDateString('ko-KR')}</span>
                  </div>
                  <span className={`text-[0.75rem] px-2 py-0.5 rounded-full border font-bold shrink-0 ${STATUS[item.status].className}`}>{STATUS[item.status].label}</span>
                </div>
                <p className="text-[0.9375rem] text-stone-800 whitespace-pre-wrap leading-relaxed">{item.content}</p>

                {view === 'mine' && item.admin_reply && (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                    <p className="text-[0.8125rem] font-bold text-blue-700 mb-1"><Icon name="envelope" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />운영자 답변</p>
                    <p className="text-xs text-stone-800 whitespace-pre-wrap">{item.admin_reply}</p>
                  </div>
                )}
                {view === 'mine' && item.status === 'received' && (
                  <div className="flex justify-end">
                    <button onClick={() => deleteItem(item)} className="text-[0.8125rem] text-stone-400 hover:text-red-500">삭제</button>
                  </div>
                )}

                {view === 'answered' && item.admin_reply && (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                    <p className="text-[0.8125rem] font-bold text-blue-700 mb-1"><Icon name="send" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />보낸 답변{item.replied_at && <span className="font-normal text-blue-500"> · {new Date(item.replied_at).toLocaleString('ko-KR')}</span>}</p>
                    <p className="text-xs text-stone-800 whitespace-pre-wrap">{item.admin_reply}</p>
                  </div>
                )}
                {isAdminList && (
                  <div className="flex flex-col gap-2 bg-stone-50 rounded-xl p-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[0.8125rem] text-stone-500">상태</span>
                      {(Object.keys(STATUS) as Feedback['status'][]).map(s => (
                        <button key={s} onClick={() => updateStatus(item, s)} className={`text-[0.8125rem] px-2 py-0.5 rounded-full border ${item.status === s ? STATUS[s].className + ' font-bold' : 'bg-white text-stone-400 border-stone-200'}`}>
                          {STATUS[s].label}
                        </button>
                      ))}
                      <button onClick={() => deleteItem(item)} className="ml-auto text-[0.8125rem] text-stone-400 hover:text-red-500">삭제</button>
                    </div>
                    <textarea
                      value={replyDrafts[item.id] ?? item.admin_reply ?? ''}
                      onChange={e => setReplyDrafts(prev => ({ ...prev, [item.id]: e.target.value }))}
                      rows={2}
                      placeholder="답변을 적으면 건의한 교우에게 알림이 갑니다"
                      className="w-full text-xs p-2.5 border border-stone-200 rounded-lg resize-none bg-white focus:outline-none"
                    />
                    <div className="flex justify-end">
                      <button onClick={() => sendReply(item)} className="text-xs px-3 py-1.5 rounded-lg bg-blue-500 text-white font-bold">
                        {item.admin_reply ? '답변 수정' : '답변 보내기'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
